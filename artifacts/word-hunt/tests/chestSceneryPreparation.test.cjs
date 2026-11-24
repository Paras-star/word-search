const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function service(loader, os = 'android', decode = () => Promise.resolve()) {
  const calls = [], elements = [], revoked = [], warnings = [], module = { exports: {} };
  class WebImage {
    constructor() { elements.push(this); }
    decode() { return decode(this); }
  }
  new Function('require', 'module', 'exports', 'globalThis', 'URL', 'console',
    compile(read('services/chestSceneryPreparation.ts')))(
    name => {
      if (name === 'expo-image') return { Image: { loadAsync: (...args) => { calls.push(args); return loader(...args); } } };
      if (name === 'react-native') return { Platform: { OS: os } };
      if (name.endsWith('chest-background.png')) return 789;
      throw Error(`Unexpected dependency: ${name}`);
    }, module, module.exports, { Image: WebImage }, { revokeObjectURL: uri => revoked.push(uri) },
    { warn: (...args) => warnings.push(args) },
  );
  return { ...module.exports, calls, elements, revoked, warnings };
}
function scene(api, layout = { safeCover: false }) {
  let state, initialized = false, cleanup, effectRan = false, dirty = false, tree, writes = 0;
  const module = { exports: {} }, warnings = [];
  const jsx = (type, props) => ({ type, props });
  new Function('require', 'module', 'exports', 'console', compile(read('components/ChestScene.tsx')))(
    name => {
      if (name === 'react') return {
        useState: initial => {
          if (!initialized) { state = initial(); initialized = true; }
          return [state, next => { state = next; dirty = true; writes++; }];
        },
        useEffect: effect => { if (!effectRan) { effectRan = true; cleanup = effect(); } },
      };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react-native') return { View: 'View', StyleSheet: { absoluteFill: {} } };
      if (name === 'expo-image') return { Image: 'ExpoImage' };
      if (name === '@/services/chestSceneryPreparation') return { ...api, CHEST_SCENERY_SOURCE: 789 };
      throw Error(name);
    }, module, module.exports, { warn: (...args) => warnings.push(args) },
  );
  function render() { dirty = false; tree = module.exports.ChestScene({ layout, children: 'closed-chest' }); }
  render();
  return {
    get tree() { return tree; }, get writes() { return writes; }, warnings,
    get layers() { return tree.props.children[0].props.children.filter(Boolean); },
    unmount() { cleanup?.(); },
    async flush() {
      for (let i = 0; i < 16; i++) { await Promise.resolve(); if (dirty) render(); }
    },
  };
}

test('intent preparation is single-flight and retains only the original full-size scenery, independent of opening resources', async () => {
  for (const os of ['android', 'ios', 'web']) {
    const load = deferred(), image = { nativeRefType: 'image', uri: 'blob:scenery', width: 937, height: 1678 };
    const api = service(() => load.promise, os);
    assert.equal(api.getPreparedChestScenery(), null);
    const pending = api.prepareChestScenery();
    assert.equal(api.prepareChestScenery(), pending);
    assert.deepEqual(api.calls, [[789]], 'no resizing, atlases, rewards or closed-frame decode');
    load.resolve(image);
    assert.equal(await pending, image);
    for (let i = 0; i < 20; i++) assert.equal(await api.prepareChestScenery(), image);
    assert.equal(api.getPreparedChestScenery(), image);
    assert.equal(api.calls.length, 1);
    assert.equal(api.elements.length, os === 'web' ? 1 : 0);
  }
});

test('web readiness waits for explicit decoding of the retained blob, not URL prefetch or load alone', async () => {
  const decode = deferred(), image = { uri: 'blob:one-scenery' };
  const api = service(async () => image, 'web', () => decode.promise);
  const preparation = api.prepareChestScenery();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(api.getPreparedChestScenery(), null);
  assert.equal(api.elements.length, 1);
  assert.equal(api.elements[0].src, image.uri);
  assert.equal(api.prepareChestScenery(), preparation);
  decode.resolve();
  assert.equal(await preparation, image);
  assert.equal(api.getPreparedChestScenery(), image);
  assert.deepEqual(api.revoked, [], 'successful blob must remain available for later display');
});

test('failed loader, synchronous throw and web decode failures are retryable without retained failed results', async () => {
  for (const failure of ['async', 'sync', 'decode']) {
    let fails = true;
    const image = { uri: 'blob:retry' };
    const api = service(() => {
      if (fails && failure === 'sync') throw Error('sync failure');
      if (fails && failure === 'async') return Promise.reject(Error('async failure'));
      return Promise.resolve(image);
    }, failure === 'decode' ? 'web' : 'android', () => fails ? Promise.reject(Error('decode failure')) : Promise.resolve());
    await assert.rejects(api.prepareChestScenery(), /failure/);
    assert.equal(api.getPreparedChestScenery(), null);
    assert.deepEqual(api.revoked, failure === 'decode' ? [image.uri] : []);
    fails = false;
    assert.equal(await api.prepareChestScenery(), image);
    assert.equal(api.calls.length, 2);
  }
});

test('press-in warmup returns immediately and handles failure without blocking or swallowing diagnostics', async () => {
  const api = service(() => { throw Error('offline'); });
  assert.equal(api.warmChestScenery(), undefined);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(api.warnings.length, 1);
  assert.match(api.warnings[0][0], /Scenery preparation failed/);
  assert.equal(api.getPreparedChestScenery(), null);
  await assert.rejects(api.prepareChestScenery(), /offline/);
  assert.equal(api.calls.length, 2);
});

test('both scenery layers share pending and decoded results across paid/free visits without gating the chest', async () => {
  const load = deferred(), image = { uri: 'blob:shared', nativeRefType: 'image' };
  const api = service(() => load.promise);
  api.warmChestScenery();
  const first = scene(api), second = scene(api);
  assert.equal(api.calls.length, 1);
  assert.equal(first.tree.props.children[1].props.children, 'closed-chest');
  assert.equal(first.layers.length, 2);
  assert.ok(first.layers.every(layer => layer.props.source === undefined),
    'display never starts a competing original-source request');
  first.unmount();
  load.resolve(image); await first.flush(); await second.flush();
  assert.equal(first.writes, 0, 'late completion cannot update an unmounted scene');
  assert.ok(second.layers.every(layer => layer.props.source === image));
  assert.equal(second.layers[0].props.contentFit, 'cover');
  assert.equal(second.layers[1].props.contentFit, 'contain');
  assert.ok(second.layers.every(layer => layer.props.transition === 0 && layer.props.contentPosition === 'center'));
  second.unmount();
  for (let visit = 0; visit < 10; visit++) {
    const next = scene(api);
    assert.ok(next.layers.every(layer => layer.props.source === image), 'warm first render uses the retained ref');
    await next.flush(); next.unmount();
  }
  assert.equal(api.calls.length, 1);
});

test('scene preparation failure warns, falls back to original artwork and retries on the next entry', async () => {
  let fails = true;
  const image = { nativeRefType: 'image' };
  const api = service(async () => { if (fails) throw Error('offline'); return image; });
  const first = scene(api);
  await first.flush();
  assert.equal(first.warnings.length, 1);
  assert.ok(first.layers.every(layer => layer.props.source === 789));
  assert.equal(first.tree.props.children[1].props.children, 'closed-chest');
  first.unmount(); fails = false;
  const next = scene(api);
  await next.flush();
  assert.ok(next.layers.every(layer => layer.props.source === image));
  assert.equal(api.calls.length, 2);
  next.unmount();
});

test('Home starts only on chest intent and navigates synchronously even if scenery is still pending', () => {
  const source = read('app/index.tsx');
  const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nodes = [];
  const visit = node => { nodes.push(node); ts.forEachChild(node, visit); }; visit(ast);
  const chest = nodes.find(node => ts.isJsxOpeningElement(node) && node.attributes.properties.some(
    attr => attr.name?.getText(ast) === 'testID' && attr.initializer?.text === 'treasure-chest-button'));
  const attr = name => chest.attributes.properties.find(a => a.name?.getText(ast) === name).initializer.expression;
  assert.equal(attr('onPressIn').getText(ast), 'warmChestScenery');
  const events = [];
  const press = new Function('warmChestScenery', 'playSound', 'router', compile(`return (${attr('onPress').getText(ast)});`))(
    () => { events.push('scenery'); }, () => events.push('tap'), { push: route => events.push(route) });
  assert.equal(press(), undefined);
  assert.deepEqual(events, ['scenery', 'tap', '/treasure-chest']);
  assert.equal(nodes.filter(node => ts.isCallExpression(node)
    && node.expression.getText(ast) === 'warmChestScenery').length, 1, 'no startup, focus or idle preload');
  assert.doesNotMatch(source, /prepareChestAssets|prepareClosedChest|CHEST_ATLASES/);
  assert.doesNotMatch(read('app/_layout.tsx'), /chestSceneryPreparation|prepareChestScenery|warmChestScenery/);
});
