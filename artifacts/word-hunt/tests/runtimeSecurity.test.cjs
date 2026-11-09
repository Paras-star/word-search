const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const apiRequire = createRequire(path.resolve(root, '../api-server/package.json'));
const appRequire = createRequire(path.join(root, 'package.json'));
const expressRequire = createRequire(apiRequire.resolve('express/package.json'));
const parserRequire = createRequire(expressRequire.resolve('body-parser/package.json'));
const routerRoot = path.dirname(appRequire.resolve('expo-router/package.json'));
const routerRequire = createRequire(path.join(routerRoot, 'package.json'));
const queryRequire = createRequire(routerRequire.resolve('query-string/package.json'));
const { getStateFromPath } = require(path.join(routerRoot, 'build/react-navigation/core/getStateFromPath.js'));
const { getPathFromState } = require(path.join(routerRoot, 'build/react-navigation/core/getPathFromState.js'));
const { parseQueryParams, getUrlWithReactNavigationConcessions } = require(path.join(routerRoot, 'build/fork/getStateFromPath-forks.js'));

test('runtime consumers resolve exactly the four approved security patches', () => {
  assert.equal(expressRequire('body-parser/package.json').version, '2.4.0');
  assert.equal(expressRequire('proxy-addr/package.json').version, '2.0.8');
  assert.equal(expressRequire('qs/package.json').version, '6.16.1');
  assert.equal(parserRequire('qs/package.json').version, '6.16.1');
  const decoderPath = queryRequire.resolve('decode-uri-component');
  const decoderPackage = JSON.parse(fs.readFileSync(path.join(path.dirname(decoderPath), 'package.json'), 'utf8'));
  assert.equal(decoderPackage.version, '0.5.1');
});

test('actual API middleware preserves JSON, forms, compression, and error recovery', async t => {
  // Load TypeScript source without invoking the API's build-based dev command.
  const scriptsRequire = createRequire(path.resolve(root, '../../scripts/package.json'));
  const { require: requireTs } = scriptsRequire('tsx/cjs/api');
  const app = requireTs('../api-server/src/app.ts', path.join(root, 'package.json')).default;
  app.post('/__security-test/parse', (req, res) => res.json(req.body));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.type || 'parse-error' }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (body, contentType = 'application/json', encoding) => new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: server.address().port, path: '/__security-test/parse', method: 'POST',
      headers: {
        'content-type': contentType, 'content-length': Buffer.byteLength(body),
        ...(encoding ? { 'content-encoding': encoding } : {}),
      },
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end(body);
  });
  const expected = { word: 'dumpling', count: 3, label: 'café 🥟' };
  const json = JSON.stringify(expected);
  assert.deepEqual(await request(json), { status: 200, body: expected });
  for (const [encoding, compress] of [
    ['gzip', zlib.gzipSync], ['deflate', zlib.deflateSync], ['br', zlib.brotliCompressSync],
  ]) {
    assert.deepEqual(await request(compress(json), 'application/json', encoding), { status: 200, body: expected });
  }
  const form = 'player[name]=Asha&words[]=WORD&words[]=HUNT&label=caf%C3%A9';
  const parsedForm = { player: { name: 'Asha' }, words: ['WORD', 'HUNT'], label: 'café' };
  assert.deepEqual(await request(form, 'application/x-www-form-urlencoded'), { status: 200, body: parsedForm });
  assert.deepEqual(await request(zlib.gzipSync(form), 'application/x-www-form-urlencoded', 'gzip'), { status: 200, body: parsedForm });
  assert.equal((await request('{invalid')).status, 400);
  assert.equal((await request(Buffer.from('invalid gzip'), 'application/json', 'gzip')).status, 400);
  const trailing = Buffer.concat([zlib.gzipSync(json), Buffer.from('trailing bytes')]);
  const response = await request(trailing, 'application/json', 'gzip');
  assert.ok([200, 400].includes(response.status));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(await request(json), { status: 200, body: expected }, 'server survives malformed compressed requests');
});

test('proxy subnet patch retains valid trust boundaries and rejects spoofed forwarded IPs', () => {
  const proxyaddr = expressRequire('proxy-addr');
  const request = { socket: { remoteAddress: '203.0.113.9' }, headers: { 'x-forwarded-for': '127.0.0.1' } };
  assert.equal(proxyaddr(request, proxyaddr.compile('10.0.0.0/8')), '203.0.113.9');
  assert.equal(proxyaddr(request, proxyaddr.compile('::ffff:10.0.0.0/8')), '203.0.113.9');
  const trust = proxyaddr.compile('10.0.0.0/8');
  assert.equal(trust('10.1.2.3'), true);
  assert.equal(trust('203.0.113.9'), false);
});

test('qs safely serializes non-coercible comma array elements', () => {
  const qs = expressRequire('qs');
  assert.doesNotThrow(() => qs.stringify({ a: [{ toString: 'x' }] }, { arrayFormat: 'comma' }));
  assert.equal(qs.stringify({ a: ['WORD', 'HUNT'] }, { arrayFormat: 'comma' }), 'a=WORD%2CHUNT');
});

const navigation = {
  screens: {
    index: '', categories: 'categories', mode: 'mode', game: 'game', results: 'results',
    daily: 'daily', collection: 'collection', reward: 'reward', 'treasure-chest': 'treasure-chest',
  },
};

test('Expo Router active query parser and route serialization preserve web and native links', () => {
  const scheme = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.scheme;
  for (const route of Object.keys(navigation.screens)) {
    const pathname = navigation.screens[route];
    for (const url of [
      `https://word-hunt.example/${pathname}?label=caf%C3%A9%20%F0%9F%A5%9F&onboardingStep=2`,
      `${scheme}:///${pathname}?label=caf%C3%A9%20%F0%9F%A5%9F&onboardingStep=2`,
    ]) {
      const parsed = new URL(url);
      const routePath = parsed.pathname + parsed.search;
      const normalized = getUrlWithReactNavigationConcessions(routePath);
      // Expo's active fork uses URLSearchParams. The upstream core query parser
      // is not used by the app and has pre-existing CommonJS/ESM incompatibility.
      const state = getStateFromPath('/' + normalized.nonstandardPathname, navigation);
      assert.ok(state, url);
      const focused = state.routes[state.index ?? state.routes.length - 1];
      focused.params = parseQueryParams(routePath, focused);
      assert.equal(focused.name, route);
      assert.equal(focused.params.label, 'café 🥟');
      assert.equal(focused.params.onboardingStep, '2');
      const serialized = getPathFromState(state, navigation);
      assert.equal(getStateFromPath(serialized.split('?')[0], navigation).routes[0].name, route);
      assert.deepEqual(parseQueryParams(serialized, { name: route }), focused.params);
    }
  }
});

test('active Expo query parser and patched ESM decoder tolerate malformed encoding', { timeout: 2000 }, () => {
  const decode = queryRequire('decode-uri-component').default;
  assert.equal(decode('caf%C3%A9'), 'café');
  assert.equal(decode('%F0%9F%A5%9F'), '🥟');
  for (const value of ['%', '%zz', '%E0%A4%A', '%252F']) {
    const params = parseQueryParams(`/game?label=${value}`, { name: 'game' });
    assert.equal(typeof params.label, 'string');
  }
  let malformed = '';
  for (let i = 0; i < 32000; i++) {
    malformed += `%${Math.floor(i / 256).toString(16).padStart(2, '0')}%${(i % 256).toString(16).padStart(2, '0')}x`;
  }
  assert.equal(typeof decode(malformed + '%zz'), 'string');
});
