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

function component(api, os = 'android') {
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
      if (name === 'react-native') return { View: 'View', StyleSheet: { absoluteFill }, Platform: { OS: os } };
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

test('web preparation and display share one retained reference, including repeated navigation without HTTP caching', async () => {
  const load = deferred(), image = { nativeRefType: 'image', uri: 'blob:retained-night' };
  const api = service(() => load.promise);
  const first = api.prepareNightBackground();
  const a = component(api, 'web'), b = component(api, 'web');
  assert.equal(api.prepareNightBackground(), first);
  assert.deepEqual(api.calls, [[456]]);
  assert.equal(a.tree.props.children.props.source, undefined, 'mounted image does not start an independent PNG request while preparation is pending');
  a.unmount();
  load.resolve(image);
  await first; await a.flush(); await b.flush();
  assert.equal(a.writes, 0);
  assert.equal(b.tree.props.children.props.source, image);
  b.unmount();
  for (let visit = 0; visit < 10; visit++) {
    const screen = component(api, 'web');
    assert.equal(screen.tree.props.children.props.source, image, 'warm background is available on the first render');
    await screen.flush();
    screen.unmount();
  }
  assert.equal(api.calls.length, 1);
  assert.equal(await api.prepareNightBackground(), image);
});

test('web preparation failure displays the original source fallback and allows a later retry', async () => {
  let succeeds = false;
  const image = { nativeRefType: 'image' };
  const api = service(async () => { if (!succeeds) throw Error('Preparation unavailable'); return image; });
  const h = component(api, 'web');
  assert.equal(h.tree.props.testID, 'night-background', 'the layer mounts immediately and never gates gameplay');
  await h.flush();
  assert.equal(h.tree.props.children.props.source, 456);
  assert.equal(h.warnings.length, 1);
  assert.equal(api.getPreparedNightBackground(), null);
  succeeds = true;
  assert.equal(await api.prepareNightBackground(), image);
  assert.equal(api.calls.length, 2);
  h.unmount();
});

test('early warmup never blocks its caller or leaks a rejected preparation, including synchronous loader failures', async () => {
  for (const os of ['android', 'ios', 'web']) {
    let fails = true;
    const load = () => { if (fails) throw Error('Preparation unavailable'); return Promise.resolve(true); };
    const api = service(load);
    const originalWarn = console.warn, warnings = [];
    try {
      console.warn = (...args) => warnings.push(args);
      assert.equal(api.warmNightBackground(), undefined, 'navigation has no promise to await');
      for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      assert.equal(warnings.length, 1);
      assert.equal(api.getPreparedNightBackground(), null);
      fails = false;
      await api.prepareNightBackground();
      assert.notEqual(api.getPreparedNightBackground(), null);
    } finally { console.warn = originalWarn; }
  }
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
  assert.ok(source.indexOf('    {background}') < source.indexOf('    {header}'),
    'night layer stays behind gameplay controls');
});

test('Home, introductory results and Calendar warm before navigation without changing destinations', () => {
  const readAst = file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const nodes = [];
    const visit = node => { nodes.push(node); ts.forEachChild(node, visit); };
    visit(ast);
    return { ast, nodes };
  };
  const evaluate = (expression, bindings) =>
    new Function(...Object.keys(bindings), compile(`return (${expression});`))(...Object.values(bindings));
  const fixtures = [
    ['app/index.tsx', 'play'],
    ['app/daily.tsx', 'openPuzzle'],
    ['app/results.tsx', null],
  ];
  for (const [file, handler] of fixtures) {
    const { ast, nodes } = readAst(file);
    const warmup = nodes.find(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('warmNightBackground'));
    assert.ok(warmup, `${file} preloads on the preceding screen`);
    const expression = handler
      ? nodes.find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === handler).initializer
      : nodes.find(node => ts.isJsxAttribute(node) && node.name.getText(ast) === 'onNext').initializer.expression;
    for (let step = 0; step < 6; step++) {
      const events = [];
      const bindings = {
        hydrated: true, onboardingStep: file.includes('results') ? step + 1 : step,
        onboarding: {}, resultStep: step, next: step < 5 ? {} : undefined,
        getOnboardingStep: index => index < 6 ? {} : undefined,
        warmNightBackground: () => { events.push('prepare'); },
        router: { push: route => events.push(route), replace: route => events.push(route) },
      };
      evaluate(warmup.arguments[0].getText(ast), bindings)();
      assert.deepEqual(events, file.includes('results') && step === 5 ? [] : ['prepare']);
      events.length = 0;
      evaluate(expression.getText(ast), bindings)('2026-11-24');
      const destination = file.includes('daily')
        ? { pathname: '/game', params: { dailyDate: '2026-11-24' } }
        : file.includes('results') && step === 5
          ? { pathname: '/mode', params: { categoryId: 'animals' } }
          : { pathname: '/game', params: { onboardingStep: String(bindings.onboardingStep) } };
      assert.deepEqual(events, file.includes('results') && step === 5 ? [destination] : ['prepare', destination]);
    }
    const events = [];
    evaluate(warmup.arguments[0].getText(ast), {
      hydrated: false, onboardingStep: 6, onboarding: undefined, resultStep: null,
      getOnboardingStep: () => undefined, warmNightBackground: () => events.push('prepare'),
    })();
    assert.deepEqual(events, [], 'unhydrated or non-introductory results do not preload');
  }
});
