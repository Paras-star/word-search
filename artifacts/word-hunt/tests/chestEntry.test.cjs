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

function rewardHarness() {
  let index = 0, tree, effects = [], resolveReward, dirty = false;
  const hooks = [];
  const pending = new Promise(resolve => { resolveReward = resolve; });
  const react = {
    useState(initial) {
      const n = index++;
      if (!hooks[n]) hooks[n] = { value: initial };
      return [hooks[n].value, value => { hooks[n].value = value; dirty = true; }];
    },
    useRef(value) { const n = index++; return hooks[n] ||= { current: value }; },
    useEffect(fn) { const n = index++; if (!hooks[n]) { hooks[n] = {}; effects.push(fn); } },
    useCallback: fn => fn,
    useMemo: fn => fn(),
  };
  class Value { interpolate() { return {}; } }
  const jsx = (type, props) => ({ type, props });
  const dumpling = { id: 'd', name: 'Dumpling', rarity: 'Common' };
  const requireMock = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react-native') return {
      ActivityIndicator: 'Spinner', Animated: { Value, View: 'AnimatedView' },
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
      StyleSheet: { create: value => value },
    };
    if (name === '@expo/vector-icons') return { Feather: 'Feather' };
    if (name === 'expo-router') return { useRouter: () => ({ replace() {} }), useLocalSearchParams: () => ({ score: '10', time: '30' }) };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (name === '@/components/GameUI') return { PrimaryButton: 'PrimaryButton', SoftButton: 'SoftButton' };
    if (name === '@/components/ChestReveal') return { ChestReveal: 'ChestReveal' };
    if (name === '@/data/dumplings') return {
      DUMPLING_BY_ID: { d: dumpling },
      RARITY_PRESENTATION: { Common: { particleCount: 1, glow: '#fff', color: '#aaa' } },
    };
    if (name === '@/game/scoring') return { formatTime: String };
    if (name === '@/services/dumplingRewards') return { getPendingReward: () => pending, collectReward() { throw Error('Not part of chest entry'); } };
    if (name === '@/services/dumplingAudio') return { stopDumplingSounds() {} };
    if (name === '@/services/audio') return { playSound() {} };
    if (name === '@/constants/homePalette') return { homeColors: {} };
    throw Error(name);
  };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/reward.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(requireMock, module, module.exports);
  const harness = {
    get tree() { return tree; },
    render() {
      index = 0; dirty = false;
      tree = module.exports.default();
      const batch = effects; effects = []; batch.forEach(fn => fn());
    },
    async resolve(reward) {
      resolveReward(reward);
      for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) harness.render(); }
    },
  };
  harness.render();
  return harness;
}

test('reward entry renders the chest immediately while saved reward storage is pending, without allowing a premature tap', async () => {
  const h = rewardHarness();
  const initial = find(h.tree, 'reward-chest-tap');
  assert.ok(initial, 'chest exists in the first reward-screen render');
  assert.equal(initial.props.opening, false);
  assert.equal(initial.props.dumpling, null);
  assert.equal(initial.props.disabled, true);
  initial.props.onPress();
  await h.resolve({ id: 'reward', dumplingId: 'd' });
  const ready = find(h.tree, 'reward-chest-tap');
  assert.equal(ready.props.opening, false, 'loading cannot initiate an opening or grant a reward');
  assert.equal(ready.props.dumpling.id, 'd');
  assert.equal(ready.props.disabled, false);
});

test('reward entry still handles absent saved rewards instead of presenting a usable free chest', async () => {
  const h = rewardHarness();
  await h.resolve(null);
  assert.equal(find(h.tree, 'reward-chest-tap'), null);
  assert.match(JSON.stringify(h.tree), /No reward is waiting/);
});

function schedulingHarness({ supportsIdle = true } = {}) {
  let id = 0;
  const frames = new Map(), idle = new Map(), timers = new Map();
  const globals = {
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: n => frames.delete(n),
    requestIdleCallback: supportsIdle ? fn => { idle.set(++id, fn); return id; } : undefined,
    cancelIdleCallback: n => idle.delete(n),
    setTimeout: fn => { timers.set(++id, fn); return id; },
    clearTimeout: n => timers.delete(n),
  };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/chestEntryScheduling.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', ...Object.keys(globals), js)(module, module.exports, ...Object.values(globals));
  const drain = queue => { const batch = [...queue.values()]; queue.clear(); batch.forEach(fn => fn()); };
  return { ...module.exports, frames, idle, timers, drain };
}

test('actual preparation scheduler yields a paint then idle time, and rapid exit cancels both stages', () => {
  const h = schedulingHarness();
  let calls = 0;
  const cancelBeforePaint = h.afterChestDisplay(() => calls++);
  assert.equal(calls, 0); assert.equal(h.idle.size, 0);
  cancelBeforePaint();
  h.drain(h.frames); h.drain(h.idle);
  assert.equal(calls, 0);
  const cancelBeforeIdle = h.afterChestDisplay(() => calls++);
  h.drain(h.frames);
  assert.equal(calls, 0); assert.equal(h.idle.size, 1);
  cancelBeforeIdle(); h.drain(h.idle);
  assert.equal(calls, 0);
  h.afterChestDisplay(() => calls++);
  h.drain(h.frames); h.drain(h.idle);
  assert.equal(calls, 1);
});

test('browsers without idle callbacks still yield a paint and support cancellation', () => {
  const h = schedulingHarness({ supportsIdle: false });
  let calls = 0;
  const cancel = h.afterChestDisplay(() => calls++);
  h.drain(h.frames);
  assert.equal(calls, 0); assert.equal(h.timers.size, 1);
  cancel(); h.drain(h.timers);
  assert.equal(calls, 0);
  h.afterChestDisplay(() => calls++);
  h.drain(h.frames); h.drain(h.timers);
  assert.equal(calls, 1);
});
