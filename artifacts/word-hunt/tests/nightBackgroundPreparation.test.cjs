const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function service(loader) {
  const calls = [], module = { exports: {} };
  new Function('require', 'module', 'exports', compile(fs.readFileSync(path.join(root, 'services/nightBackgroundPreparation.ts'), 'utf8')))(
    name => {
      if (name === 'expo-image') return { Image: { loadAsync: (...args) => { calls.push(args); return loader(...args); } } };
      if (name.endsWith('night-forest-background.png')) return 456;
      throw Error(name);
    }, module, module.exports,
  );
  return { ...module.exports, calls };
}

function component(api) {
  let state, initialized = false, cleanup, effectRan = false, dirty = false, writes = 0, tree;
  const warnings = [], module = { exports: {} };
  const absoluteFill = { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 };
  new Function('require', 'module', 'exports', 'console', compile(fs.readFileSync(path.join(root, 'components/NightPuzzleBackground.tsx'), 'utf8')))(
    name => {
      if (name === 'react') return {
        useState: initial => {
          if (!initialized) { state = initial(); initialized = true; }
          return [state, next => { state = next; dirty = true; writes++; }];
        },
        useEffect: effect => { if (!effectRan) { effectRan = true; cleanup = effect(); } },
      };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === 'react-native') return { View: 'View', StyleSheet: { absoluteFill } };
      if (name === 'expo-image') return { Image: 'ExpoImage' };
      if (name === '@/services/nightBackgroundPreparation') return api;
      throw Error(name);
    }, module, module.exports, { warn: (...args) => warnings.push(args) },
  );
  function render() { dirty = false; tree = module.exports.NightPuzzleBackground(); }
  render();
  return {
    get tree() { return tree; }, get writes() { return writes; }, warnings,
    unmount() { cleanup?.(); },
    async flush() {
      for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render(); }
    },
  };
}

test('night asset preserves the original uploaded PNG byte-for-byte, dimensions and Animal asset', () => {
  const night = fs.readFileSync(path.join(root, 'assets/images/backgrounds/night-forest-background.png'));
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(night.length, 6498501);
  assert.equal(night.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(night.readUInt32BE(16), 1440);
  assert.equal(night.readUInt32BE(20), 3200);
  assert.equal(hash(night), 'a1b6ab904fbcc549f7c893ecb02bd820188976de698d42a365afcae57392632b');
  assert.equal(hash(fs.readFileSync(path.join(root, 'assets/images/backgrounds/animals-background.png'))),
    '0043981c75885ab34051022e7cc00d3350badab370c9b4fede057bacf50b7dcc');
});

test('night preparation is single-flight, full-resolution and reuses one decoded image across visits', async () => {
  const load = deferred(), image = { nativeRefType: 'image', width: 1440, height: 3200 };
  const api = service(() => load.promise);
  assert.equal(api.getPreparedNightBackground(), null);
  const first = api.prepareNightBackground();
  assert.equal(api.prepareNightBackground(), first);
  assert.deepEqual(api.calls, [[456]], 'no resizing, conversion or quality reduction');
  load.resolve(image);
  assert.equal(await first, image);
  for (let i = 0; i < 10; i++) assert.equal(await api.prepareNightBackground(), image);
  assert.equal(api.getPreparedNightBackground(), image);
  assert.equal(api.calls.length, 1);
});

test('failed night preparation rejects and can retry without poisoning the cache', async () => {
  let fails = true;
  const image = { nativeRefType: 'image' };
  const api = service(() => fails ? Promise.reject(Error('Decode failed')) : Promise.resolve(image));
  await assert.rejects(api.prepareNightBackground(), /Decode failed/);
  assert.equal(api.getPreparedNightBackground(), null);
  fails = false;
  assert.equal(await api.prepareNightBackground(), image);
  assert.equal(api.calls.length, 2);
});

test('night rendering immediately uses the source, then adopts the decoded reference without changing centered cover', async () => {
  const load = deferred(), image = { nativeRefType: 'image' }, api = service(() => load.promise);
  const h = component(api);
  assert.equal(h.tree.props.children.props.source, 456);
  assert.equal(h.tree.props.testID, 'night-background');
  assert.equal(h.tree.props.pointerEvents, 'none');
  const props = h.tree.props.children.props;
  assert.equal(props.contentFit, 'cover');
  assert.equal(props.contentPosition, 'center');
  assert.equal(props.transition, 0);
  assert.equal(props.accessible, false);
  assert.deepEqual(props.style, [h.tree.props.style, { width: '100%', height: '100%' }]);
  assert.equal(props.onLoad, undefined);
  assert.equal(props.onDisplay, undefined);
  load.resolve(image); await h.flush();
  assert.equal(h.tree.props.children.props.source, image);
  h.unmount();
  const next = component(api);
  assert.equal(next.tree.props.children.props.source, image, 'cached on first render of next puzzle');
  assert.equal(api.calls.length, 1);
  next.unmount();
});

test('unmounting a night puzzle prevents late state writes while preserving the shared preparation', async () => {
  const load = deferred(), image = { nativeRefType: 'image' }, api = service(() => load.promise);
  const first = component(api), second = component(api);
  assert.equal(api.calls.length, 1);
  first.unmount();
  load.resolve(image); await first.flush(); await second.flush();
  assert.equal(first.writes, 0);
  assert.equal(second.tree.props.children.props.source, image);
  assert.equal(api.getPreparedNightBackground(), image);
  second.unmount();
});

test('night preparation failure warns explicitly and keeps the original source without blocking play', async () => {
  const api = service(async () => { throw Error('Decode failed'); });
  const h = component(api);
  await h.flush();
  assert.equal(h.tree.props.children.props.source, 456);
  assert.equal(h.warnings.length, 1);
  assert.match(h.warnings[0][0], /Night preparation failed; using the source image/);
  h.unmount();
});

test('all six introductory puzzles and Calendar use night exclusively; normal and future categories retain Animal', () => {
  const source = fs.readFileSync(path.join(root, 'app/game.tsx'), 'utf8');
  const ast = ts.createSourceFile('game.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const all = [];
  function visit(node) { all.push(node); ts.forEachChild(node, visit); }
  visit(ast);
  const declaration = all.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'usesCategoryBackground');
  const night = all.find(n => ts.isJsxExpression(n) && n.getText(ast).includes('<NightPuzzleBackground />'));
  const animal = all.find(n => ts.isJsxExpression(n) && n.getText(ast).includes('testID="animals-background"'));
  assert.ok(declaration && night && animal);
  const choose = new Function('rawOnboardingStep', 'rawDailyDate', compile(`
    const ${declaration.getText(ast)};
    return { animal: ${animal.expression.left.getText(ast)}, night: ${night.expression.left.getText(ast)} };
  `));
  for (let step = 0; step < 6; step++) {
    assert.deepEqual(choose(String(step), undefined), { animal: false, night: true }, `introductory step ${step}`);
  }
  for (const date of ['2026-11-23', '', 'invalid', '2999-01-01']) {
    assert.deepEqual(choose(undefined, date), { animal: false, night: true });
  }
  assert.deepEqual(choose('0', '2026-11-23'), { animal: false, night: true });
  assert.deepEqual(choose(undefined, undefined), { animal: true, night: false },
    'selection is independent of category identity, including future categories');
  assert.ok(source.indexOf('<NightPuzzleBackground />') < source.indexOf('<Header title={category.name}'),
    'night layer stays behind gameplay controls');
});
