const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  new Function('require', 'module', 'exports', compile(fs.readFileSync(path.join(root, 'services/animalBackgroundPreparation.ts'), 'utf8')))(
    name => {
      if (name === 'expo-image') return { Image: { loadAsync: (...args) => { calls.push(args); return loader(...args); } } };
      if (name.endsWith('animals-background.png')) return 123;
      throw Error(name);
    }, module, module.exports,
  );
  return { ...module.exports, calls };
}

function nodes(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const all = [];
  function visit(node) { all.push(node); ts.forEachChild(node, visit); }
  visit(ast);
  return { source, ast, all };
}

function gameHarness(api, initial = {}) {
  const { ast, all } = nodes('app/game.tsx');
  const declarations = ['isAnimalPuzzle', '[animalBackground, setAnimalBackground]'].map(name => {
    const node = all.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name);
    assert.ok(node, name);
    return `const ${node.getText(ast)};`;
  }).join('\n');
  const effect = all.find(n => ts.isExpressionStatement(n) && n.getText(ast).startsWith('useEffect(')
    && n.getText(ast).includes('prepareAnimalBackground()'));
  const view = all.find(n => ts.isJsxElement(n) && n.openingElement.attributes.properties
    .some(p => ts.isJsxAttribute(p) && p.name.getText(ast) === 'testID' && p.initializer?.text === 'animals-background'));
  const js = compile(`${declarations}\n${effect.getText(ast)}\nreturn isAnimalPuzzle ? (${view.getText(ast)}) : null;`);
  let state, initialized = false, oldDeps, cleanup, pendingEffect, tree, dirty = false, writes = 0;
  let context = { category: { id: 'animals' }, onboarding: null, daily: null, ...initial };
  const warnings = [];
  const render = () => {
    dirty = false;
    tree = new Function('require', 'exports', 'category', 'onboarding', 'daily', 'useState', 'useEffect',
      'getPreparedAnimalBackground', 'prepareAnimalBackground', 'ANIMALS_BACKGROUND_SOURCE',
      'Image', 'View', 'StyleSheet', 'console', js)(
      name => { assert.equal(name, 'react/jsx-runtime'); return { jsx: (type, props) => ({ type, props }) }; },
      {},
      context.category, context.onboarding, context.daily,
      initialState => {
        if (!initialized) { state = initialState(); initialized = true; }
        return [state, next => { state = next; dirty = true; writes++; }];
      },
      (fn, deps) => {
        if (!oldDeps || deps.some((dep, i) => dep !== oldDeps[i])) {
          cleanup?.(); oldDeps = deps; pendingEffect = fn;
        }
      },
      api.getPreparedAnimalBackground, api.prepareAnimalBackground, api.ANIMALS_BACKGROUND_SOURCE,
      'ExpoImage', 'View', { absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
      { warn: (...args) => warnings.push(args) },
    );
    if (pendingEffect) { const fn = pendingEffect; pendingEffect = null; cleanup = fn(); }
  };
  const h = {
    get tree() { return tree; }, get writes() { return writes; }, warnings,
    render(next) { if (next) context = { ...context, ...next }; render(); },
    async flush() { for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render(); } },
    unmount() { cleanup?.(); },
  };
  render();
  return h;
}

test('Animals preparation is single-flight and retains the same decoded image across visits without resizing', async () => {
  const load = deferred(), image = { nativeRefType: 'image', width: 1440, height: 3200 };
  const api = service(() => load.promise);
  assert.equal(api.getPreparedAnimalBackground(), null);
  const first = api.prepareAnimalBackground();
  assert.equal(api.prepareAnimalBackground(), first);
  assert.deepEqual(api.calls, [[123]], 'same asset, no image-resizing options');
  load.resolve(image);
  assert.equal(await first, image);
  for (let i = 0; i < 10; i++) assert.equal(await api.prepareAnimalBackground(), image);
  assert.equal(api.getPreparedAnimalBackground(), image);
  assert.equal(api.calls.length, 1);
});

test('failed preparation rejects explicitly and permits a fresh attempt', async () => {
  const image = { nativeRefType: 'image' };
  let fails = true;
  const api = service(() => fails ? Promise.reject(Error('Decode failed')) : Promise.resolve(image));
  await assert.rejects(api.prepareAnimalBackground(), /Decode failed/);
  assert.equal(api.getPreparedAnimalBackground(), null);
  fails = false;
  assert.equal(await api.prepareAnimalBackground(), image);
  assert.equal(api.calls.length, 2);
});

test('mode preparation runs only for hydrated Animals selection after onboarding; navigation remains immediate', async () => {
  const { ast, all } = nodes('app/mode.tsx');
  const effect = all.find(n => ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect'
    && n.getText(ast).includes('prepareAnimalBackground()'));
  const run = new Function('categoryId', 'hydrated', 'onboardingStep', 'prepareAnimalBackground', 'useEffect', 'console',
    compile(effect.getText(ast)));
  for (const categoryId of ['animals', 'food', 'sports', undefined]) {
    for (const hydrated of [false, true]) for (const step of [0, 6]) {
      let calls = 0;
      run(categoryId, hydrated, step, () => { calls++; return Promise.resolve({}); }, fn => fn(), console);
      assert.equal(calls, categoryId === 'animals' && hydrated && step === 6 ? 1 : 0);
    }
  }
  const start = all.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'start');
  assert.match(start.getText(ast), /=> router\.replace\(/);
  assert.doesNotMatch(start.getText(ast), /await|prepareAnimalBackground/);
});

test('a prewarmed native image is passed directly to Expo Image on the first game render', async () => {
  const image = { nativeRefType: 'image' }, api = service(async () => image);
  await api.prepareAnimalBackground();
  const h = gameHarness(api);
  const rendered = h.tree.props.children;
  assert.equal(rendered.type, 'ExpoImage');
  assert.equal(rendered.props.source, image);
  assert.equal(rendered.props.contentFit, 'cover');
  assert.equal(rendered.props.contentPosition, 'center');
  assert.equal(rendered.props.transition, 0);
  assert.equal(h.tree.props.pointerEvents, 'none');
  assert.equal(rendered.props.onLoad, undefined, 'no iOS loader-event readiness gate');
  assert.equal(rendered.props.onDisplay, undefined);
  assert.deepEqual(rendered.props.style.at(-1), { width: '100%', height: '100%' });
  h.unmount();
});

test('fast/direct entry shows the original source immediately, shares pending preparation and adopts its decoded ref', async () => {
  const load = deferred(), api = service(() => load.promise), image = { nativeRefType: 'image' };
  const preparing = api.prepareAnimalBackground();
  const h = gameHarness(api);
  assert.equal(h.tree.props.children.props.source, 123);
  assert.equal(api.calls.length, 1);
  load.resolve(image); await preparing; await h.flush();
  assert.equal(h.tree.props.children.props.source, image);
  h.unmount();
});

test('other categories, onboarding and Daily neither prepare nor show the Animals background', async () => {
  for (const context of [{ category: { id: 'food' } }, { category: { id: 'sports' } },
    { onboarding: {} }, { daily: {} }]) {
    const api = service(async () => ({})), h = gameHarness(api, context);
    await h.flush();
    assert.equal(h.tree, null);
    assert.equal(api.calls.length, 0);
    h.unmount();
  }
});

test('leaving while preparation is pending cannot update the departed screen; decoded cache survives for re-entry', async () => {
  const load = deferred(), api = service(() => load.promise), image = { nativeRefType: 'image' };
  const h = gameHarness(api);
  h.unmount(); load.resolve(image); await h.flush();
  assert.equal(h.writes, 0);
  const next = gameHarness(api);
  assert.equal(next.tree.props.children.props.source, image);
  assert.equal(api.calls.length, 1);
  next.unmount();
});

test('preparation failure logs an explicit warning and leaves the original asset available without blocking the screen', async () => {
  const api = service(async () => { throw Error('Decode failed'); }), h = gameHarness(api);
  await h.flush();
  assert.equal(h.tree.props.children.props.source, 123);
  assert.equal(h.warnings.length, 1);
  assert.match(h.warnings[0][0], /using the source image/);
  h.unmount();
});
