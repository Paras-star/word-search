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

function normalCategoryIds() {
  const { all } = nodes('data/categories.ts');
  const categories = all.find(n => ts.isVariableDeclaration(n) && n.name.getText() === 'CATEGORIES');
  return categories.initializer.elements.map(category =>
    category.properties.find(property => property.name.getText() === 'id').initializer.text);
}

const categoryIds = normalCategoryIds();
const futureCategoryId = 'hypothetical-future-category-after-workshop';

function gameHarness(api, initial = {}) {
  const { ast, all } = nodes('app/game.tsx');
  const declarations = ['usesCategoryBackground', '[animalBackground, setAnimalBackground]'].map(name => {
    const node = all.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name);
    assert.ok(node, name);
    return `const ${node.getText(ast)};`;
  }).join('\n');
  const effect = all.find(n => ts.isExpressionStatement(n) && n.getText(ast).startsWith('useEffect(')
    && n.getText(ast).includes('prepareAnimalBackground()'));
  const background = all.find(n => ts.isJsxExpression(n) && n.expression && ts.isBinaryExpression(n.expression)
    && n.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    && n.getText(ast).includes('testID="animals-background"'));
  const js = compile(`${declarations}\n${effect.getText(ast)}\nreturn (${background.expression.getText(ast)}) || null;`);
  let state, initialized = false, oldDeps, cleanup, pendingEffect, tree, dirty = false, writes = 0;
  let context = { category: { id: 'animals' }, rawOnboardingStep: undefined, rawDailyDate: undefined, ...initial };
  const warnings = [];
  const render = () => {
    dirty = false;
    tree = new Function('require', 'exports', 'category', 'rawOnboardingStep', 'rawDailyDate', 'useState', 'useEffect',
      'getPreparedAnimalBackground', 'prepareAnimalBackground', 'ANIMALS_BACKGROUND_SOURCE',
      'Image', 'View', 'StyleSheet', 'console', js)(
      name => { assert.equal(name, 'react/jsx-runtime'); return { jsx: (type, props) => ({ type, props }) }; },
      {},
      context.category, context.rawOnboardingStep, context.rawDailyDate,
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

test('mode preparation covers every existing and future category after onboarding; navigation remains immediate', async () => {
  const { ast, all } = nodes('app/mode.tsx');
  const effect = all.find(n => ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect'
    && n.getText(ast).includes('prepareAnimalBackground()'));
  const run = new Function('categoryId', 'hydrated', 'onboardingStep', 'prepareAnimalBackground', 'useEffect', 'console',
    compile(effect.getText(ast)));
  for (const categoryId of [...categoryIds, futureCategoryId, undefined, '']) {
    for (const hydrated of [false, true]) for (const step of [0, 1, 2, 3, 4, 5, 6]) {
      let calls = 0;
      run(categoryId, hydrated, step, () => { calls++; return Promise.resolve({}); }, fn => fn(), console);
      assert.equal(calls, categoryId && hydrated && step === 6 ? 1 : 0, `${categoryId}, hydrated=${hydrated}, step=${step}`);
    }
  }
  const start = all.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'start');
  assert.match(start.getText(ast), /=> router\.replace\(/);
  assert.doesNotMatch(start.getText(ast), /await|prepareAnimalBackground/);
});

test('Animals through Workshop and a future category use the identical prepared image and unchanged fitting on first render', async () => {
  const image = { nativeRefType: 'image' }, api = service(async () => image);
  await api.prepareAnimalBackground();
  assert.equal(categoryIds[0], 'animals');
  assert.equal(categoryIds.at(-1), 'workshop');
  assert.ok(!categoryIds.includes(futureCategoryId));
  for (const id of [...categoryIds, futureCategoryId]) {
    const h = gameHarness(api, { category: { id } });
    const rendered = h.tree.props.children;
    assert.equal(rendered.type, 'ExpoImage', id);
    assert.equal(rendered.props.source, image, id);
    assert.equal(rendered.props.contentFit, 'cover');
    assert.equal(rendered.props.contentPosition, 'center');
    assert.equal(rendered.props.transition, 0);
    assert.equal(rendered.props.accessible, false);
    assert.equal(h.tree.props.pointerEvents, 'none');
    assert.equal(rendered.props.onLoad, undefined, 'no iOS loader-event readiness gate');
    assert.equal(rendered.props.onDisplay, undefined);
    assert.deepEqual(rendered.props.style, [
      { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
      { width: '100%', height: '100%' },
    ]);
    h.unmount();
  }
  assert.equal(api.calls.length, 1, 'all categories reuse the single retained image');
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

test('all six onboarding levels and Calendar requests neither prepare nor show the category background', async () => {
  const excluded = [
    ...Array.from({ length: 6 }, (_, step) => ({ rawOnboardingStep: String(step) })),
    { rawOnboardingStep: 'invalid-step' },
    ...['2026-11-23', 'invalid-date', '', '2999-01-01'].map(rawDailyDate => ({ rawDailyDate })),
    { rawOnboardingStep: '0', rawDailyDate: '2026-11-23' },
  ];
  for (const context of excluded) {
    const api = service(async () => ({})), h = gameHarness(api, context);
    await h.flush();
    assert.equal(h.tree, null);
    assert.equal(api.calls.length, 0);
    h.unmount();
  }
});

test('switching categories during preparation shares one load, then reuses its reference on every re-entry', async () => {
  const load = deferred(), image = { nativeRefType: 'image' }, api = service(() => load.promise);
  const screens = [...categoryIds, futureCategoryId].map(id => {
    const h = gameHarness(api, { category: { id } });
    assert.equal(h.tree.props.children.props.source, 123, id);
    return h;
  });
  assert.equal(api.calls.length, 1);
  for (const h of screens.slice(0, -1)) h.unmount();
  load.resolve(image);
  for (const h of screens) await h.flush();
  for (const h of screens.slice(0, -1)) assert.equal(h.writes, 0);
  assert.equal(screens.at(-1).tree.props.children.props.source, image);
  screens.at(-1).unmount();
  for (const id of [...categoryIds, futureCategoryId]) {
    const h = gameHarness(api, { category: { id } });
    assert.equal(h.tree.props.children.props.source, image, id);
    h.unmount();
  }
  assert.equal(api.calls.length, 1);
});

test('switching to Calendar or onboarding cancels a pending screen update without discarding the shared cache', async () => {
  for (const excluded of [{ rawDailyDate: '2026-11-23' }, { rawOnboardingStep: '0' }]) {
    const load = deferred(), image = { nativeRefType: 'image' }, api = service(() => load.promise);
    const h = gameHarness(api, { category: { id: 'food' } });
    h.render(excluded);
    assert.equal(h.tree, null);
    load.resolve(image);
    await h.flush();
    assert.equal(h.writes, 0);
    assert.equal(api.getPreparedAnimalBackground(), image);
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
