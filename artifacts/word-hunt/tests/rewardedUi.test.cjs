const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('Home wires a separate 100-coin action below the unchanged 700-coin chest', () => {
  const source = read('app/index.tsx');
  assert.match(source, /Treasure Chest, 700 coins/);
  assert.ok(source.indexOf('testID="treasure-chest-button"') < source.indexOf('testID="home-rewarded-coins-button"'));
  assert.match(source, /createCoinReward\(awardCoins\)/);
  assert.match(source, /reward=\{`\+\$\{HOME_REWARDED_COINS\} COINS`\}/);
  assert.match(source, /variant="artwork"/);
  assert.match(source, /source=\{require\('\.\.\/assets\/images\/rewards\/free-coins\.png'\)\}/);
  const bytes = fs.readFileSync(path.join(root, 'assets/images/rewards/free-coins.png'));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), 'ce74abcbfc675936782ce8e86db614fc0dc27e7029170b4465838f955fbf6e67',
    'the supplied transparent artwork must remain byte-identical');
  assert.equal(bytes.readUInt32BE(16), 500);
  assert.equal(bytes.readUInt32BE(20), 500);
  assert.equal(bytes[25], 6, 'original RGBA transparency is retained');
});

test('gameplay shares its additive hint balance between the top use button and bottom rewarded control', () => {
  const source = read('app/game.tsx');
  assert.match(source, /const \[hints, setHints\] = useState\(3\)/);
  assert.doesNotMatch(source, /testID="(?:use-hint-button|hint-button)"|USE HINT|NO HINTS LEFT/);
  assert.match(source, /testID="hint-rewarded-button"/);
  assert.equal((source.match(/<RewardedAdButton/g) ?? []).length, 1);
  assert.match(source, /<Pressable accessible accessibilityRole="button" onPress=\{useHint\}[^>]*testID="hint-balance"/);
  assert.match(source, /label="WATCH AD ·"/);
  assert.match(source, /setHints\(\(prev\) => prev \+ amount\)/);
  assert.match(source, /activePuzzleKey\.current = null/);
  assert.match(source, /completionStarted\.current \? null : activePuzzleKey\.current/);
  assert.match(source, /completionStarted\.current \|\| adPaused\.current/);
  assert.match(source, /startTime\.current \+= Date\.now\(\) - pausedAt/);
  assert.doesNotMatch(source, /showInterstitialAtTransition/);
  const rewardHandler = source.slice(source.indexOf('  const watchHintAd ='), source.indexOf('  const finish ='));
  assert.doesNotMatch(rewardHandler, /setHintCells|useHint\(|setHints\(3\)/);
  assert.match(source, /setHints\(value => Math\.max\(0, value - 1\)\)/);
});

test('level completion and touch mapping remain byte-identical after removing the free-hint action', () => {
  const source = read('app/game.tsx');
  const hashes = {
    '  const finish =': 'bfb066693b950f7470ca02d1d50b39d1b6e5108b06e6c6a00ed06fcf56e524b2',
    '  const cellFromEvent =': '15eeee31f7a4a81ed2fea14d53ee15d63a7beebb40f86f4f41486faede201846',
  };
  for (const [start, expected] of Object.entries(hashes)) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1);
    const block = source.slice(from, source.indexOf('\n\n', from));
    assert.equal(crypto.createHash('sha256').update(block).digest('hex'), expected, start);
  }
});

test('Results keeps exclusions and rewarded ads but never counts or triggers interstitials', () => {
  const source = read('app/results.tsx');
  assert.match(source, /isOnboardingRoute \|\| isDailyRoute \|\| onboardingStep < 6/);
  assert.doesNotMatch(source, /registerCompletedPuzzle|showInterstitialAtTransition/);
  assert.match(source, /watchRewardedForCoins\(awardCoins\)/);
  assert.match(source, /if \(navigating\.current\) return/);
  assert.match(source, /router\.replace\(destination\)/);
  const reward = read('app/reward.tsx');
  const collection = reward.slice(reward.indexOf('  const viewCollection ='), reward.indexOf('  const goToResults ='));
  assert.doesNotMatch(collection, /showInterstitialAtTransition/);
  assert.match(collection, /newDumplingId: dumpling\.id/);
  const reveal = reward.slice(reward.indexOf('  const startReveal ='), reward.indexOf('  const viewCollection ='));
  assert.doesNotMatch(reveal, /showInterstitialAtTransition/);
});

// Execute the actual screen/handlers with deterministic hooks and native stubs.
// This checks behavior, not just the source contracts above; no device ads run.
function rewardScreenHarness(options = {}) {
  const params = { categoryId: 'animals', mode: 'classic', score: '100', time: '12', puzzleId: 'puzzle-one', ...options.params };
  const saved = { id: 'reward-one', puzzleId: params.puzzleId, dumplingId: 'one', rarity: 'Common', collectionState: 'earned', ...options.reward };
  const progress = { hydrated: true, onboardingStep: 6, ...options.progress };
  const calls = { registrations: [], shows: [], navigation: [] };
  const counted = options.counted ?? new Set();
  const slots = [];
  let cursor = 0, effects = [], focusCleanup, focusCallback, stateListener, tree;
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; },
    useState: value => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = value;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!equal(slots[i]?.deps, deps)) effects.push(() => {
        slots[i]?.cleanup?.();
        slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  const appState = {
    currentState: 'active',
    addEventListener: (_, callback) => { stateListener = callback; return { remove() { stateListener = null; } }; },
  };
  const mockRequire = name => {
    if (name === 'react') return { __esModule: true, default: react, ...react };
    if (name === 'react-native') return {
      AppState: appState, StyleSheet: { create: s => s },
      Animated: { Value: class { interpolate() { return 0; } } },
    };
    if (name === 'expo-router') return {
      useRouter: () => ({ replace: destination => calls.navigation.push(destination) }),
      useLocalSearchParams: () => params,
      useFocusEffect: callback => react.useEffect(() => {
        focusCallback = callback;
        focusCleanup = callback();
        return () => { focusCleanup?.(); focusCleanup = null; };
      }, []),
    };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (name === '@/context/GameProvider') return { useGame: () => progress };
    if (name === '@/data/dumplings') return {
      DUMPLING_BY_ID: { one: { id: 'one', name: 'One', rarity: 'Common' } },
      RARITY_PRESENTATION: { Common: { particleCount: 1, color: '#000', glow: '#fff' } },
    };
    if (name === '@/services/dumplingRewards') return {
      getPendingReward: async () => options.noReward ? null : saved,
      collectReward: async () => ({ reward: saved, isDuplicate: !!options.duplicate }),
    };
    if (name === '@/services/ads') return {
      registerCompletedPuzzle: id => { if (!counted.has(id)) { counted.add(id); calls.registrations.push(id); } },
      showInterstitialAtTransition: transition => {
        calls.shows.push(transition);
        return new Promise((resolve, reject) => { calls.resolve = resolve; calls.reject = reject; });
      },
    };
    if (name === '@/game/scoring') return { formatTime: () => '0:12' };
    if (name === '@/constants/homePalette') return { homeColors: {} };
    if (name === '@/services/audio') return { playSound() {} };
    if (name === '@/services/dumplingAudio') return { stopDumplingSounds() {} };
    return {}; // Render-only icons/components are opaque in this handler test.
  };
  const module = { exports: {} };
  const code = ts.transpileModule(read('app/reward.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(mockRequire, module, module.exports);
  const render = () => {
    cursor = 0;
    tree = module.exports.default();
    const pending = effects;
    effects = [];
    pending.forEach(fn => fn());
  };
  const find = (node, match) => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) return node.map(n => find(n, match)).find(Boolean);
    return match(node.props ?? {}) ? node : find(node.props?.children, match);
  };
  const press = label => {
    const node = find(tree, props => props.testID === label || props.children?.includes(label));
    assert.ok(node, `Missing action ${label}`);
    return node.props.onPress();
  };
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); render(); };
  return {
    params, progress, calls, counted, render, press, flush,
    mount: async () => { render(); await flush(); },
    collect: async () => {
      find(tree, props => props.testID === 'reward-chest-tap').props.onRevealed();
      render();
      await press('reward-collect');
      render();
    },
    blur: () => { focusCleanup?.(); focusCleanup = null; },
    refocus: () => { focusCleanup = focusCallback(); },
    background: () => { appState.currentState = 'background'; stateListener?.('background'); },
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('reward counts before either choice; collection is immediate, ad-free, and retains highlighting', async () => {
  for (const duplicate of [false, true]) {
    const screen = rewardScreenHarness({ duplicate });
    await screen.mount();
    assert.deepEqual(screen.calls.registrations, ['puzzle-one']);
    assert.equal(screen.calls.shows.length, 0);
    await screen.collect();
    screen.press('VIEW COLLECTION ROOM');
    screen.press('CONTINUE'); // Competing rapid tap cannot change the destination.
    assert.deepEqual(screen.calls.navigation, [{ pathname: '/collection', params: duplicate ? undefined : { newDumplingId: 'one' } }]);
    assert.equal(screen.calls.shows.length, 0);
    screen.unmount();
  }
});

test('reward validation and repeat effects/remounts retain distinct completion counting', async () => {
  const screen = rewardScreenHarness();
  await screen.mount();
  screen.progress.hydrated = false;
  screen.render();
  screen.progress.hydrated = true;
  screen.render();
  screen.unmount();
  const remount = rewardScreenHarness({ counted: screen.counted });
  await remount.mount();
  assert.equal(screen.calls.registrations.length + remount.calls.registrations.length, 1);
  remount.unmount();
  for (const options of [
    { reward: { puzzleId: 'other' } }, { reward: { dumplingId: 'missing' } },
    { progress: { onboardingStep: 5 } }, { progress: { hydrated: false } }, { noReward: true },
    { params: { puzzleId: '' } }, { params: { puzzleId: '   ' } }, { params: { puzzleId: undefined } },
  ]) {
    const invalid = rewardScreenHarness(options);
    await invalid.mount();
    assert.equal(invalid.calls.registrations.length, 0);
    invalid.unmount();
  }
});

test('Continue attempts once and reaches Results once for every ad outcome or rejection', async () => {
  for (const status of ['closed', 'skipped', 'failed', 'timed-out', 'cancelled', 'rejected']) {
    const screen = rewardScreenHarness();
    await screen.mount();
    await screen.collect();
    screen.press('CONTINUE');
    screen.press('CONTINUE');
    screen.press('VIEW COLLECTION ROOM');
    assert.equal(screen.calls.shows.length, 1);
    assert.equal(screen.calls.navigation.length, 0);
    if (status === 'rejected') screen.calls.reject(new Error('SDK failure'));
    else screen.calls.resolve({ status });
    screen.calls.resolve({ status: 'closed' }); // Duplicate settlement cannot navigate twice.
    await screen.flush();
    assert.deepEqual(screen.calls.navigation, [{ pathname: '/results', params: screen.params }]);
    screen.unmount();
  }
});

test('invalid reward completion cannot borrow prior eligibility but Continue still reaches Results', async () => {
  const screen = rewardScreenHarness({ reward: { puzzleId: 'other' } });
  await screen.mount();
  await screen.collect();
  screen.press('CONTINUE');
  assert.equal(screen.calls.shows.length, 0);
  assert.equal(screen.calls.navigation[0].pathname, '/results');
  screen.unmount();
});

test('leaving/unmounting cancels stale ad/navigation; background prevents presentation without trapping Continue', async () => {
  for (const action of ['blur', 'unmount', 'background']) {
    const screen = rewardScreenHarness();
    await screen.mount();
    await screen.collect();
    screen.press('CONTINUE');
    assert.equal(screen.calls.shows[0].canPresent(), true);
    screen[action]();
    assert.equal(screen.calls.shows[0].signal.aborted, true);
    assert.equal(screen.calls.shows[0].canPresent(), false);
    if (action === 'blur') screen.refocus(); // Old request must remain invalid after refocus.
    screen.calls.resolve({ status: 'cancelled' });
    await screen.flush();
    assert.equal(screen.calls.navigation.length, action === 'background' ? 1 : 0);
    screen.unmount();
  }
});

test('reward UI guards repeated taps and disables controls for load/presentation with retry feedback', () => {
  const hook = read('hooks/useRewardedAd.ts');
  assert.match(hook, /if \(inFlight\.current\) return null/);
  assert.match(hook, /inFlight\.current = true/);
  assert.match(hook, /watchRewarded\(onEarned, placement\)/);
  assert.match(hook, /inFlight\.current = false/);
  const button = read('components/RewardedAdButton.tsx');
  assert.match(button, /status === 'pending' \|\| loading/);
  assert.match(button, /disabled=\{blocked\}/);
  assert.match(button, /UNAVAILABLE_MESSAGE = 'No ads at the moment'/);
  assert.match(button, /unavailable: UNAVAILABLE_MESSAGE/);
  assert.match(button, /announceForAccessibility\(UNAVAILABLE_MESSAGE\)/);
  assert.match(button, /accessibilityLiveRegion="polite"/);
});
