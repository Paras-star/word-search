const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function find(tree, id) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.props?.testID === id) return tree;
  return [tree.props?.children].flat().map(child => find(child, id)).find(Boolean) || null;
}

function harness(platform, balance = 1400) {
  let index = 0, dirty = false, tree, effects = [], purchase, mounted = true;
  const hooks = [], requests = [], routes = [], backHandlers = [], options = [];
  let beforeRemove;
  const game = {
    coins: balance, hydrated: true,
    purchaseTreasureChest: id => {
      requests.push(id);
      return new Promise((resolve, reject) => { purchase = { resolve, reject }; });
    },
  };
  const react = {
    useRef: value => { const n = index++; return hooks[n] ||= { current: value }; },
    useState: value => {
      const n = index++;
      if (!hooks[n]) hooks[n] = { value };
      return [hooks[n].value, value => { hooks[n].value = value; dirty = true; }];
    },
    useCallback: fn => fn,
    useEffect: (fn, deps) => {
      const n = index++, old = hooks[n];
      if (!old || deps.some((dep, i) => dep !== old.deps[i])) {
        effects.push(() => { old?.cleanup?.(); hooks[n] = { deps, cleanup: fn() }; });
      }
    },
  };
  const navigation = {
    setOptions: value => options.push(value),
    addListener: (_, fn) => { beforeRemove = fn; return () => { beforeRemove = null; }; },
  };
  const router = {
    canGoBack: () => true, back: () => routes.push('back'), replace: route => routes.push(route),
  };
  const dumpling = { id: 'd', name: 'Test Dumpling', rarity: 'Rare' };
  const jsx = (type, props) => ({ type, props });
  const source = fs.readFileSync(path.join(__dirname, '../app/treasure-chest.tsx'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return {
      View: 'View', Image: 'Image', Text: 'Text', ScrollView: 'ScrollView', Modal: 'Modal',
      Platform: { OS: platform }, StyleSheet: { create: x => x, absoluteFill: {} },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      BackHandler: { addEventListener: (_, fn) => {
        backHandlers.push(fn);
        return { remove: () => backHandlers.splice(backHandlers.indexOf(fn), 1) };
      } },
    };
    if (name === 'expo-router') return { useRouter: () => router, useNavigation: () => navigation };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 47, bottom: 34 }) };
    if (name === '@/components/GameUI') return { PrimaryButton: 'PrimaryButton', SoftButton: 'SoftButton' };
    if (name === '@/components/ChestReveal') return { ChestReveal: 'ChestReveal' };
    if (name === '@/context/GameProvider') return { useGame: () => game };
    if (name === '@/data/dumplings') return {
      DUMPLING_BY_ID: { d: dumpling }, RARITY_PRESENTATION: { Rare: { glow: '#fff' }, Common: { glow: '#fff' } },
    };
    if (name === '@/constants/homePalette') return { homeColors: {} };
    if (name === '@/services/dumplingAudio') return { stopDumplingSounds() {} };
    if (name === '@/services/treasureChest') return { TREASURE_CHEST_COST: 700 };
    if (name.endsWith('.png')) return name;
    throw Error(name);
  }, module, module.exports);
  const h = {
    game, requests, routes, options,
    get tree() { return tree; },
    render() {
      index = 0; dirty = false; tree = module.exports.default();
      const batch = effects; effects = []; batch.forEach(fn => fn());
    },
    async flush() {
      for (let i = 0; i < 10; i++) { await Promise.resolve(); if (dirty && mounted) h.render(); }
    },
    async tap(id) {
      const node = find(tree, id);
      assert.ok(node, id);
      assert.notEqual(node.props.disabled, true, `${id} must be enabled`);
      node.props.onPress(); await h.flush();
    },
    modal() { return tree.props.children.find(child => child?.type === 'Modal'); },
    blocked() { let blocked = false; beforeRemove?.({ preventDefault: () => { blocked = true; } }); return blocked; },
    async resolve({ duplicate = false, recovery = false } = {}) {
      game.coins -= 700;
      purchase.resolve({ reward: { dumplingId: 'd' }, isDuplicate: duplicate, recoveryPending: recovery });
      await h.flush();
    },
    async reject() { purchase.reject(Error('Save unavailable')); await h.flush(); },
    async reveal() { find(tree, 'treasure-chest-tap').props.onRevealed(); await h.flush(); },
    unmount() { mounted = false; hooks.forEach(hook => hook?.cleanup?.()); },
  };
  h.render();
  return h;
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: cancel, confirm once, reveal, and Collection navigation preserve purchase safeguards`, async () => {
    const h = harness(platform);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.options, platform === 'ios' ? [{ gestureEnabled: true }] : []);
    await h.tap('treasure-chest-tap');
    assert.equal(h.modal().props.visible, true);
    await h.tap('treasure-cancel');
    assert.equal(h.modal().props.visible, false);
    assert.equal(h.game.coins, 1400);
    await h.tap('treasure-chest-tap');
    const confirm = find(h.tree, 'treasure-confirm').props.onPress;
    confirm(); confirm(); await h.flush();
    assert.equal(h.requests.length, 1, 'rapid double confirmation must remain single-flight');
    assert.equal(h.modal().props.visible, false);
    assert.equal(h.blocked(), true);
    if (platform === 'ios') assert.equal(h.options.at(-1).gestureEnabled, false);
    await h.resolve();
    assert.equal(h.game.coins, 700);
    assert.equal(find(h.tree, 'treasure-chest-tap').props.opening, true);
    assert.equal(h.blocked(), true, 'exit must remain blocked until reveal completes');
    await h.reveal();
    assert.equal(h.blocked(), false);
    if (platform === 'ios') assert.equal(h.options.at(-1).gestureEnabled, true);
    assert.ok(find(h.tree, 'treasure-result-name'));
    await h.tap('treasure-collection');
    assert.deepEqual(h.routes, [{ pathname: '/collection', params: { newDumplingId: 'd' } }]);
    h.unmount();
  });

  test(`${platform}: failed save retries with the same identity, duplicate/recovery result allows Done`, async () => {
    const h = harness(platform);
    await h.tap('treasure-chest-tap'); await h.tap('treasure-confirm');
    await h.reject();
    assert.equal(h.game.coins, 1400);
    assert.equal(h.modal().props.visible, true);
    assert.equal(h.blocked(), false);
    if (platform === 'ios') assert.equal(h.options.at(-1).gestureEnabled, true);
    assert.ok(find(h.tree, 'treasure-error'));
    await h.tap('treasure-confirm');
    assert.equal(h.requests[0], h.requests[1]);
    await h.resolve({ duplicate: true, recovery: true }); await h.reveal();
    assert.match(JSON.stringify(h.tree), /Duplicate recorded/);
    assert.match(JSON.stringify(h.tree), /Local save recovery/);
    await h.tap('treasure-collection');
    assert.equal(h.routes.at(-1), '/collection');
    await h.tap('treasure-leave-done');
    assert.equal(h.routes.at(-1), 'back');
    h.unmount();
  });

  test(`${platform}: shortage message and blocked interaction below 700 remain unchanged`, () => {
    for (const coins of [0, 50, 699, 700, 1400]) {
      const h = harness(platform, coins);
      assert.equal(!!find(h.tree, 'treasure-need'), coins < 700);
      assert.equal(find(h.tree, 'treasure-chest-tap').props.disabled, coins < 700);
      assert.equal(h.blocked(), false);
      assert.deepEqual(h.options, platform === 'ios' ? [{ gestureEnabled: true }] : []);
      assert.equal(h.requests.length, 0);
      h.unmount();
    }
  });
}
