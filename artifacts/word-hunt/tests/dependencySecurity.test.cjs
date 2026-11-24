const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const appRequire = createRequire(path.join(root, 'package.json'));
const expoRequire = createRequire(appRequire.resolve('expo/package.json'));
const fingerprintRequire = createRequire(expoRequire.resolve('@expo/fingerprint/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
const specRequire = createRequire(path.resolve(root, '../../lib/api-spec/package.json'));
const orvalRequire = createRequire(specRequire.resolve('orval/package.json'));
const typedocRequire = createRequire(orvalRequire.resolve('typedoc/package.json'));

test('affected consumers resolve patched dependency versions', () => {
  assert.equal(appRequire('zod/package.json').version, '4.6.7');
  assert.equal(fingerprintRequire('glob/package.json').version, '14.0.6');
  assert.equal(fingerprintRequire('minimatch/package.json').version, '11.0.9');
  assert.equal(typedocRequire('minimatch/package.json').version, '11.0.9');
  assert.equal(cliRequire('node-forge/package.json').version, '1.4.4');
});

test('Zod preserves API validation and error formatting after the major upgrade', () => {
  const scriptsRequire = createRequire(path.resolve(root, '../../scripts/package.json'));
  const { require: requireTs } = scriptsRequire('tsx/cjs/api');
  const { HealthCheckResponse } = requireTs('../../lib/api-zod/src/generated/api.ts', path.join(root, 'package.json'));
  assert.deepEqual(HealthCheckResponse.parse({ status: 'ok' }), { status: 'ok' });
  const invalid = HealthCheckResponse.safeParse({ status: 123 });
  assert.equal(invalid.success, false);
  const { fromZodError } = appRequire('zod-validation-error');
  assert.match(fromZodError(invalid.error).message, /status/);
  const { z } = appRequire('zod');
  const oversized = z.array(z.string()).max(2).safeParse(Array(10000).fill(123));
  assert.equal(oversized.success, false);
  assert.equal(oversized.error.issues.length, 1, 'oversized arrays fail before collecting per-element issues');
});

test('Expo fingerprint glob and minimatch APIs preserve file selection and cancellation', async () => {
  const { glob } = fingerprintRequire('glob');
  const { minimatch, Minimatch } = fingerprintRequire('minimatch');
  const files = await glob('app/**/*.tsx', { cwd: root });
  assert.ok(files.includes('app/index.tsx'));
  assert.equal(minimatch('app/index.tsx', 'app/**/*.tsx'), true);
  assert.equal(new Minimatch('app/**/*.tsx').match('assets/icon.png'), false);
  const controller = new AbortController();
  controller.abort(new Error('cancelled security test'));
  await assert.rejects(glob('**/*', { cwd: root, signal: controller.signal }), /cancelled security test/);
});

test('node-forge rejects forged small-order keys and preserves valid signatures', () => {
  const forge = cliRequire('node-forge');
  const identity = Buffer.alloc(32);
  identity[0] = 1;
  const forged = Buffer.alloc(64);
  forged[0] = 1;
  assert.equal(forge.ed25519.verify({
    message: 'admin=true', encoding: 'utf8', publicKey: identity, signature: forged,
  }), false);
  const keys = forge.ed25519.generateKeyPair();
  const signature = forge.ed25519.sign({ message: 'Word Hunt', encoding: 'utf8', privateKey: keys.privateKey });
  assert.equal(forge.ed25519.verify({
    message: 'Word Hunt', encoding: 'utf8', publicKey: keys.publicKey, signature,
  }), true);
});

test('node-forge safely ignores handshake records without a client session', () => {
  const forge = cliRequire('node-forge');
  const client = forge.tls.createConnection({
    server: false, tlsDataReady() {}, dataReady() {}, connected() {}, closed() {}, error() {},
  });
  const hello = forge.util.hexToBytes('160301000402000000');
  assert.doesNotThrow(() => client.process(hello));
  client.handshake();
  client.process(forge.util.hexToBytes('15030100020100'));
  assert.doesNotThrow(() => client.process(hello));
});

test('node-forge handles long whitespace response headers without changing values', () => {
  const forge = cliRequire('node-forge');
  cliRequire('node-forge/lib/http');
  const response = forge.http.createResponse();
  const value = `a${'\t '.repeat(40000)}X`;
  response.readHeader(forge.util.createBuffer(`HTTP/1.1 200 OK\r\nX-Test: ${value} \t\r\n\r\n`));
  assert.equal(response.getField('X-Test'), value);
});

test('node-forge reports unsupported TLS compression instead of throwing', () => {
  const forge = cliRequire('node-forge');
  const errors = [];
  const client = forge.tls.createConnection({
    server: false, tlsDataReady() {}, dataReady() {}, connected() {}, closed() {},
    error(connection, error) { errors.push(error); },
  });
  client.handshake();
  const body = '\x03\x03' + '\x00'.repeat(32) + '\x00\x00\x2f\xff';
  const handshake = '\x02\x00\x00' + String.fromCharCode(body.length) + body;
  const record = '\x16\x03\x03\x00' + String.fromCharCode(handshake.length) + handshake;
  assert.doesNotThrow(() => client.process(record));
  assert.ok(errors.some(error => /compression/i.test(error.message)));
});
