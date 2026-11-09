const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const webRoot = path.join(root, 'static-build/web');
const audioSource = path.join(root, 'assets/chest-animation/chest-opening.wav');
const audioUrl = '/assets/chest-animation/chest-opening.9fd528762abc4bce8f53fc8a64ec929a.wav';

// Exercise the production handler without building, writing exports, or opening ports.
function serverHarness() {
  let handler;
  const files = new Map([
    [path.join(webRoot, 'index.html'), Buffer.from('<html>Word Hunt</html>')],
    // Model Expo's public-folder copy using the actual maintained file.
    [path.join(webRoot, 'app-ads.txt'), fs.readFileSync(path.join(root, 'public/app-ads.txt'))],
    [audioSource, fs.readFileSync(audioSource)],
  ]);
  const fakeFs = {
    existsSync: file => files.has(file),
    statSync: file => ({ isFile: () => files.has(file) }),
    readFileSync(file) {
      assert.ok(files.has(file), `Unexpected file read: ${file}`);
      return files.get(file);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'server/serve.js'), 'utf8'), {
    __dirname: path.join(root, 'server'),
    require(name) {
      if (name === 'fs') return fakeFs;
      if (name === 'http') return {
        createServer(callback) {
          handler = callback;
          return { listen() {} };
        },
      };
      return require(name);
    },
    process: { env: { PORT: '3000', BASE_PATH: '/' } },
    console: { log() {} },
    URL,
  });
  return url => {
    const response = {
      status: null,
      headers: {},
      body: null,
      writeHead(status, headers = {}) {
        this.status = status;
        this.headers = headers;
      },
      end(body) { this.body = body; },
    };
    handler({ url, headers: { host: 'word-hunt.example' } }, response);
    return response;
  };
}

test('app-ads.txt has the exact approved seller record and serves as plain text', () => {
  const expected = 'google.com, pub-9827389269181842, DIRECT, f08c47fec0942fa0\n';
  assert.equal(fs.readFileSync(path.join(root, 'public/app-ads.txt'), 'utf8'), expected);
  const response = serverHarness()('/app-ads.txt');
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(response.body.toString(), expected);
});

test('missing exported chest WAV serves the exact original bytes at its hashed URL', () => {
  const original = fs.readFileSync(audioSource);
  assert.equal(createHash('md5').update(original).digest('hex'), '9fd528762abc4bce8f53fc8a64ec929a');
  assert.equal(createHash('sha256').update(original).digest('hex'), '6581e641876271cf9bc365858da98f3bebc20ad10f0ffc1ee2325c51a062c4fa');
  const response = serverHarness()(audioUrl);
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'audio/wav');
  assert.deepEqual(response.body, original);
});

test('audio fallback does not expose source paths or accept unrelated hashes', () => {
  const request = serverHarness();
  for (const url of [
    '/assets/chest-animation/chest-opening.wrong.wav',
    '/assets/chest-animation/chest-opening.wav',
    '/assets/chest-animation/chest-opening.m4a',
    '/server/serve.js',
    '/assets/chest-animation/../../server/serve.js',
  ]) {
    assert.equal(request(url).status, 404, url);
  }
});
