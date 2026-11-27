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

const jsx = (type, props) => ({ type, props });
function paidPresentation(props) {
  const actionable = !!props.revealed && !props.loading && !props.busy && !!props.dumpling;
  const children = [
    jsx('Pressable', { testID: props.chestTestID, disabled: props.chestDisabled ?? (props.loading || !props.dumpling || props.opening || props.revealed),
      opening: props.opening, onPress: props.onOpen, onRevealed: props.onRevealed }),
    props.statusMessage && jsx('Text', {
      testID: props.statusTestID,
      style: [{ color: '#c8322b', fontFamily: 'Inter_700Bold', fontSize: 15 }, { top: 197 }],
      children: props.statusMessage,
    }),
    props.error && jsx('View', {
      testID: props.retryContainerTestID,
      children: [
        jsx('Text', { testID: props.errorTestID, accessibilityRole: 'alert', children: props.error }),
        props.retryAction,
      ],
    }),
    props.revealed && props.dumpling && jsx('View', {
      testID: 'reward-rarity-banner', accessibilityLabel: `${props.dumpling.rarity} ${props.dumpling.name}`,
      children: jsx('Text', { testID: 'reward-dumpling-name', children: props.dumpling.name.toUpperCase() }),
    }),
  ];
  if (props.showActions) {
    children.push(
      jsx('Pressable', { testID: props.collectionTestID, disabled: !actionable, onPress: props.onCollection }),
      jsx('Pressable', { testID: props.continueTestID, disabled: !actionable, onPress: props.onContinue }),
    );
  }
  if (props.purchaseNote) children.push(jsx('Text', {
    testID: 'treasure-reward-note',
    children: [
      props.purchaseNote.isDuplicate ? 'This dumpling is already in your Collection.' : null,
      props.purchaseNote.recoveryPending ? 'The purchase is saved; local save recovery will retry automatically.' : null,
    ].filter(Boolean).join(' '),
  }));
  return jsx('View', { testID: props.sceneTestID, presentationProps: props, children });
}

function expand(tree) {
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: [tree.props?.children].flat(Infinity).map(expand) } };
}

function harness(platform, balance = 1400, hydrated = true, canGoBack = true) {
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
    canGoBack: () => canGoBack, back: () => routes.push('back'), replace: route => routes.push(route),
  };
  const dumpling = { id: 'd', name: 'Test Dumpling', rarity: 'Rare' };
  const source = fs.readFileSync(path.join(__dirname, '../app/treasure-chest.tsx'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return {
      View: 'View', Pressable: 'Pressable', Image: 'Image', Text: 'Text', ScrollView: 'ScrollView',
      Platform: { OS: platform }, StyleSheet: { create: x => x, absoluteFill: {} },
      useWindowDimensions: () => ({ width: 390, height: 844 }),
      BackHandler: { addEventListener: (_, fn) => {
        backHandlers.push(fn);
        return { remove: () => backHandlers.splice(backHandlers.indexOf(fn), 1) };
      } },
    };
    if (name === 'expo-router') return { useRouter: () => router, useNavigation: () => navigation };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 9, right: 0 }) };
    if (name === '@expo/vector-icons') return { Feather: 'Feather' };
    if (name === '@/components/GameUI') return { PrimaryButton: 'PrimaryButton' };
    if (name === '@/components/NormalRewardScene') return { __esModule: true, default: paidPresentation };
    if (name === '@/context/GameProvider') return { useGame: () => game };
    if (name === '@/data/dumplings') return {
      DUMPLING_BY_ID: { d: dumpling }, RARITY_PRESENTATION: { Rare: { glow: '#fff' }, Common: { glow: '#fff' } },
    };
    if (name === '@/constants/homePalette') return { homeColors: { goldSoft: '#FFF0D0' } };
    if (name === '@/services/dumplingAudio') return { stopDumplingSounds() {} };
    if (name === '@/services/treasureChest') return { TREASURE_CHEST_COST: 700 };
    if (name.endsWith('.png')) return name;
    throw Error(name);
  }, module, module.exports);
  const h = {
    game, requests, routes, options,
    get tree() { return tree; },
    render() {
      index = 0; dirty = false; tree = expand(module.exports.default());
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
  test(`${platform}: plain safe-area back arrow leaves without purchasing and supports direct entry`, async () => {
    for (const canGoBack of [true, false]) {
      const h = harness(platform, 1400, true, canGoBack);
      const back = find(h.tree, 'treasure-back');
      const style = Object.assign({}, ...back.props.style);
      assert.equal(style.position, 'absolute');
      assert.equal(style.top, (platform === 'web' ? 67 : 47) + 8);
      assert.equal(style.left, 21);
      assert.ok(style.width >= 48 && style.height >= 48);
      assert.equal(style.zIndex, 1, 'arrow stays above the scene');
      assert.deepEqual(Object.keys(style).sort(), ['alignItems', 'height', 'justifyContent', 'left', 'position', 'top', 'width', 'zIndex'].sort(),
        'no background, border, shadow or decoration on the touch target');
      assert.equal(back.props.children.length, 1);
      assert.equal(back.props.children[0].type, 'Feather');
      assert.equal(back.props.children[0].props.name, 'arrow-left');
      assert.equal(back.props.children[0].props.size, 28);
      assert.equal(back.props.children[0].props.color, '#FFF0D0');
      assert.equal(back.props.accessibilityLabel, 'Back');
      await h.tap('treasure-back');
      assert.deepEqual(h.routes, [canGoBack ? 'back' : '/']);
      assert.equal(h.requests.length, 0);
      assert.equal(h.game.coins, 1400);
      h.unmount();
    }
  });

  test(`${platform}: back arrow honors immediate purchase guard, reveal completion and failed-save exit`, async () => {
    const h = harness(platform);
    const staleBack = find(h.tree, 'treasure-back').props.onPress;
    find(h.tree, 'treasure-chest-tap').props.onPress();
    staleBack();
    assert.deepEqual(h.routes, [], 'same-frame back cannot interrupt purchase');
    await h.flush();
    assert.equal(find(h.tree, 'treasure-back').props.disabled, true);
    staleBack();
    await h.resolve();
    assert.equal(find(h.tree, 'treasure-back').props.disabled, true);
    find(h.tree, 'treasure-back').props.onPress();
    assert.deepEqual(h.routes, [], 'reveal cannot be interrupted');
    await h.reveal();
    await h.tap('treasure-back');
    assert.deepEqual(h.routes, ['back']);
    assert.equal(h.game.coins, 700);
    assert.equal(h.requests.length, 1);
    h.unmount();

    const failed = harness(platform);
    await failed.tap('treasure-chest-tap');
    await failed.reject();
    await failed.tap('treasure-back');
    assert.deepEqual(failed.routes, ['back']);
    assert.equal(failed.game.coins, 1400);
    failed.unmount();
  });

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
    assert.equal(find(h.tree, 'reward-dumpling-name').props.children[0], 'TEST DUMPLING');
    const presentation = find(h.tree, 'treasure-reward-scene').props.presentationProps;
    assert.equal(presentation.showStats, false);
    assert.equal(presentation.showHomeButton, false);
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
    assert.equal(find(h.tree, 'treasure-error').props.children[0], 'Save unavailable');
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
    assert.match(JSON.stringify(h.tree), /already in your Collection/);
    assert.match(JSON.stringify(h.tree), /local save recovery/);
    await h.tap('treasure-collection');
    assert.equal(h.routes.at(-1), '/collection');
    await h.tap('treasure-continue');
    assert.equal(h.routes.at(-1), 'back');
    h.unmount();
  });

  test(`${platform}: exact shortfall/ready text and existing red styling track live balances`, () => {
    for (const coins of [0, 50, 699, 700, 810, 1400]) {
      const h = harness(platform, coins);
      const status = find(h.tree, 'treasure-need');
      assert.equal(status.props.children[0], coins < 700
        ? `700 coins required. You need ${700 - coins} more.` : 'Chest is Ready!');
      assert.equal(status.props.style[0].color, '#c8322b');
      assert.equal(status.props.style[0].fontFamily, 'Inter_700Bold');
      assert.equal(status.props.style[0].fontSize, 15);
      assert.ok(status.props.style[1].top > 0);
      assert.equal(find(h.tree, 'treasure-chest-tap').props.disabled, coins < 700);
      assert.equal(h.blocked(), false);
      assert.deepEqual(h.options, platform === 'ios' ? [{ gestureEnabled: true }] : []);
      assert.equal(h.requests.length, 0);
      h.unmount();
    }
    const h = harness(platform, 699);
    for (const coins of [700, 810, 50, 1400]) {
      h.game.coins = coins; h.render();
      assert.equal(find(h.tree, 'treasure-need').props.children[0], coins < 700
        ? `700 coins required. You need ${700 - coins} more.` : 'Chest is Ready!');
      assert.equal(find(h.tree, 'treasure-chest-tap').props.disabled, coins < 700);
    }
    assert.equal(h.requests.length, 0, 'balance updates never purchase automatically');
    h.unmount();
  });

  test(`${platform}: 700 and 810 coins open directly and leave exactly 0 and 110`, async () => {
    for (const balance of [700, 810]) {
      const h = harness(platform, balance);
      assert.equal(find(h.tree, 'treasure-need').props.children[0], 'Chest is Ready!');
      await h.tap('treasure-chest-tap');
      assert.equal(h.requests.length, 1);
      await h.resolve(); await h.reveal();
      assert.equal(h.game.coins, balance - 700);
      assert.equal(find(h.tree, 'reward-dumpling-name').props.children[0], 'TEST DUMPLING');
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
