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

function harness(platform, balance = 1400, hydrated = true) {
  let index = 0, dirty = false, tree, effects = [], purchase, mounted = true;
  const hooks = [], requests = [], routes = [], backHandlers = [], options = [];
  let beforeRemove;
  const game = {
    coins: balance, hydrated,
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
      View: 'View', Image: 'Image', Text: 'Text', ScrollView: 'ScrollView',
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
    if (name === '@/components/ChestScene') return {
      ChestScene: 'ChestScene',
      useChestSceneLayout: () => ({ layout: { H: 844, imgY: 0, imgH: 844, chestTop: 260, stage: 200 }, onLayout() {} }),
    };
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

test('provider queue returns purchase failures to the caller without leaving an unhandled rejected drain', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../context/GameProvider.tsx'), 'utf8');
  const queueSource = source.match(/const queueSave = useCallback[\s\S]*?^  \}, \[\]\);/m)?.[0];
  assert.ok(queueSource, 'exercise the real provider queue implementation');
  const js = ts.transpileModule(`${queueSource}\nmodule.exports = queueSave;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const writes = { current: Promise.resolve() };
  const module = { exports: {} };
  let locks = 0;
  new Function('useCallback', 'writes', 'withGameStateLock', 'module', js)(
    fn => fn, writes, operation => { locks++; return operation(); }, module,
  );
  const queueSave = module.exports;
  const error = new Error('Purchase save unavailable');
  const failedPurchase = queueSave(async () => { throw error; }, false);
  await assert.rejects(failedPurchase, cause => cause === error, 'the screen must still receive the error');
  await assert.doesNotReject(writes.current, 'the internal queue drain must not create a second unhandled rejection');
  assert.equal(locks, 0, 'the purchase service still owns its lock');
  assert.equal(await queueSave(async () => 'retry succeeded', false), 'retry succeeded');
  assert.equal(await queueSave(async () => 'ordinary save'), 'ordinary save');
  assert.equal(locks, 1, 'ordinary saves keep their existing lock');
});

for (const platform of ['ios', 'android', 'web']) {
  test(`${platform}: direct tap purchases once, reveals, and preserves Collection navigation`, async () => {
    const h = harness(platform);
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.options, platform === 'ios' ? [{ gestureEnabled: true }] : []);
    for (const id of ['treasure-confirmation', 'treasure-confirm', 'treasure-cancel']) {
      assert.equal(find(h.tree, id), null, 'there is no confirmation step');
    }
    const tap = find(h.tree, 'treasure-chest-tap').props.onPress;
    tap(); tap(); await h.flush();
    assert.equal(h.requests.length, 1, 'rapid double tap before rerender must remain single-flight');
    assert.equal(h.game.coins, 1400, 'the UI never deducts coins before the transaction resolves');
    assert.equal(find(h.tree, 'treasure-chest-tap').props.disabled, true);
    assert.equal(find(h.tree, 'treasure-chest-tap').props.opening, false);
    assert.equal(find(h.tree, 'treasure-need'), null);
    tap(); await h.flush();
    assert.equal(h.requests.length, 1, 'a stale callback cannot bypass the processing guard');
    assert.equal(h.blocked(), true);
    if (platform === 'ios') assert.equal(h.options.at(-1).gestureEnabled, false);
    await h.resolve();
    assert.equal(h.game.coins, 700);
    assert.equal(find(h.tree, 'treasure-chest-tap').props.opening, true);
    assert.equal(h.blocked(), true, 'exit must remain blocked until reveal completes');
    await h.reveal();
    assert.equal(h.blocked(), false);
    tap(); await h.flush();
    assert.equal(h.requests.length, 1, 'success prevents another purchase even with 700 coins remaining');
    assert.equal(find(h.tree, 'treasure-chest-tap').props.disabled, true);
    assert.equal(find(h.tree, 'treasure-need'), null);
    if (platform === 'ios') assert.equal(h.options.at(-1).gestureEnabled, true);
    assert.ok(find(h.tree, 'treasure-result-name'));
    await h.tap('treasure-collection');
    assert.deepEqual(h.routes, [{ pathname: '/collection', params: { newDumplingId: 'd' } }]);
    h.unmount();
  });

  test(`${platform}: failed save retries with the same identity, duplicate/recovery result allows Done`, async () => {
    const h = harness(platform);
    await h.tap('treasure-chest-tap');
    await h.reject();
    assert.equal(h.game.coins, 1400);
    assert.ok(find(h.tree, 'treasure-purchase-error'));
    assert.equal(find(h.tree, 'treasure-confirmation'), null);
    assert.equal(h.blocked(), false);
    if (platform === 'ios') assert.equal(h.options.at(-1).gestureEnabled, true);
    assert.equal(find(h.tree, 'treasure-error').props.accessibilityRole, 'alert');
    assert.equal(find(h.tree, 'treasure-error').props.children, 'Save unavailable');
    const retry = find(h.tree, 'treasure-retry').props.onPress;
    retry(); retry(); await h.flush();
    assert.equal(h.requests.length, 2, 'retry is also synchronously single-flight');
    assert.equal(h.requests[0], h.requests[1]);
    assert.equal(find(h.tree, 'treasure-error'), null, 'retry clears the previous error');
    assert.equal(h.blocked(), true);
    await h.resolve({ duplicate: true, recovery: true });
    assert.equal(h.game.coins, 700);
    assert.equal(find(h.tree, 'treasure-error'), null, 'committed recovery is success, not a retryable failure');
    assert.equal(find(h.tree, 'treasure-retry'), null);
    await h.reveal();
    assert.match(JSON.stringify(h.tree), /Duplicate recorded/);
    assert.match(JSON.stringify(h.tree), /Local save recovery/);
    await h.tap('treasure-collection');
    assert.equal(h.routes.at(-1), '/collection');
    await h.tap('treasure-leave-done');
    assert.equal(h.routes.at(-1), 'back');
    h.unmount();
  });

  test(`${platform}: exact shortfall/ready text and existing red styling track live balances`, () => {
    for (const coins of [0, 50, 699, 700, 810, 1400]) {
      const h = harness(platform, coins);
      const status = find(h.tree, 'treasure-need');
      assert.equal(status.props.children, coins < 700
        ? `700 coins required. You need ${700 - coins} more.` : 'Chest is Ready!');
      assert.equal(status.props.style[0].color, '#c8322b');
      assert.equal(status.props.style[0].fontFamily, 'Inter_700Bold');
      assert.equal(status.props.style[0].fontSize, 15);
      assert.equal(status.props.style[1].top, 844 * 0.245);
      assert.equal(find(h.tree, 'treasure-chest-tap').props.disabled, coins < 700);
      assert.equal(h.blocked(), false);
      assert.deepEqual(h.options, platform === 'ios' ? [{ gestureEnabled: true }] : []);
      assert.equal(h.requests.length, 0);
      h.unmount();
    }
    const h = harness(platform, 699);
    for (const coins of [700, 810, 50, 1400]) {
      h.game.coins = coins; h.render();
      assert.equal(find(h.tree, 'treasure-need').props.children, coins < 700
        ? `700 coins required. You need ${700 - coins} more.` : 'Chest is Ready!');
      assert.equal(find(h.tree, 'treasure-chest-tap').props.disabled, coins < 700);
    }
    assert.equal(h.requests.length, 0, 'balance updates never purchase automatically');
    h.unmount();
  });

  test(`${platform}: 700 and 810 coins open directly and leave exactly 0 and 110`, async () => {
    for (const balance of [700, 810]) {
      const h = harness(platform, balance);
      assert.equal(find(h.tree, 'treasure-need').props.children, 'Chest is Ready!');
      await h.tap('treasure-chest-tap');
      assert.equal(h.requests.length, 1);
      await h.resolve(); await h.reveal();
      assert.equal(h.game.coins, balance - 700);
      assert.ok(find(h.tree, 'treasure-result-name'));
      h.unmount();
    }
  });

  test(`${platform}: unhydrated and insufficient balance cannot purchase even if callbacks are invoked`, async () => {
    for (const [balance, hydrated] of [[699, true], [810, false]]) {
      const h = harness(platform, balance, hydrated);
      assert.equal(find(h.tree, 'treasure-chest-tap').props.disabled, true);
      if (!hydrated) assert.equal(find(h.tree, 'treasure-need'), null);
      find(h.tree, 'treasure-chest-tap').props.onPress(); await h.flush();
      assert.equal(h.requests.length, 0);
      assert.equal(h.game.coins, balance);
      h.unmount();
    }
  });

  test(`${platform}: inline retry honors changed balance and hydration eligibility`, async () => {
    const h = harness(platform, 810);
    await h.tap('treasure-chest-tap'); await h.reject();
    for (const [coins, hydrated] of [[699, true], [810, false]]) {
      h.game.coins = coins; h.game.hydrated = hydrated; h.render();
      assert.equal(find(h.tree, 'treasure-retry').props.disabled, true);
      find(h.tree, 'treasure-retry').props.onPress(); await h.flush();
      assert.equal(h.requests.length, 1, 'ineligible retry cannot reach the purchase service');
      assert.ok(find(h.tree, 'treasure-error'));
    }
    h.game.coins = 810; h.game.hydrated = true; h.render();
    await h.tap('treasure-retry');
    assert.equal(h.requests[0], h.requests[1]);
    await h.resolve(); await h.reveal();
    assert.equal(h.game.coins, 110);
    h.unmount();
  });
}
