const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, requireMock, globals = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), js)(requireMock, m, m.exports, ...Object.values(globals));
  return m.exports;
}

function find(tree, id) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.props?.testID === id) return tree;
  return [tree.props?.children].flat().map(child => find(child, id)).find(Boolean) || null;
}
const jsx = (type, props) => ({ type, props });

test('decoded native cache is single-flight and bounded; re-entry does not decode any of the 73 frames or 30 rewards again', async () => {
  const decoded = [];
  const dumplings = Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, asset: 100 + i }));
  const cache = load('services/chestPreparation.ts', name => {
    if (name === 'expo-image') return { Image: { loadAsync: async (source, options) => {
      decoded.push({ source, options }); return { source, bitmap: true };
    } } };
    if (name === '@/data/dumplings') return { DUMPLINGS: dumplings };
    if (name === '@/components/chestAnimationData') return { CHEST_ATLASES: [0, 1, 2, 3, 4], CHEST_FRONT: 5 };
    throw Error(name);
  });
  const first = cache.prepareChestAssets();
  assert.equal(cache.prepareChestAssets(), first);
  const refs = await first;
  assert.equal(decoded.length, 36);
  assert.equal(refs.atlases.length, 5);
  assert.equal(refs.dumplings.size, 30);
  assert.ok(decoded.slice(6).every(x => x.options.maxWidth === 384 && x.options.maxHeight === 384));
  for (let i = 0; i < 25; i++) assert.equal(await cache.prepareChestAssets(), refs);
  assert.equal(decoded.length, 36);
  assert.equal(cache.getPreparedChest(), refs);
});

function nativeHarness({ preparationFails = false } = {}) {
  let index = 0, dirty = false, tree, effects = [], renders = 0, opening = false, now = 0;
  let callbacks = 0, plays = 0, taps = 0, failure = preparationFails;
  const hooks = [], shared = [], listeners = new Set(), timers = new Map(), jsQueue = [];
  const cached = { atlases: Array.from({ length: 5 }, (_, i) => ({ bitmap: i })), front: { bitmap: 'front' },
    dumplings: new Map([['d', { bitmap: 'dumpling' }]]) };
  const react = {
    useRef: value => { const n = index++; return hooks[n] ||= { current: value }; },
    useState: initial => { const n = index++; if (!hooks[n]) hooks[n] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[n].value, value => { hooks[n].value = value; dirty = true; }]; },
    useCallback: (fn, deps) => { const n = index++; if (!hooks[n] || deps.some((d, i) => d !== hooks[n].deps[i])) hooks[n] = { fn, deps }; return hooks[n].fn; },
    useEffect: (fn, deps) => { const n = index++; const old = hooks[n];
      if (!old || deps.some((d, i) => d !== old.deps[i])) effects.push(() => { old?.cleanup?.(); hooks[n] = { deps, cleanup: fn() }; }); },
  };
  react.useLayoutEffect = react.useEffect;
  const reanimated = {
    __esModule: true, default: { View: 'AnimatedView' }, Easing: { linear: 'linear' },
    useSharedValue: initial => {
      const ref = react.useRef(null);
      if (!ref.current) {
        const state = { number: initial, animation: null };
        Object.defineProperty(state, 'value', {
          get: () => state.number,
          set: value => { if (value && value.nativeTiming) state.animation = { ...value, start: state.number, elapsed: 0 };
            else { state.animation = null; state.number = value; } },
        });
        ref.current = state; shared.push(state);
      }
      return ref.current;
    },
    useAnimatedStyle: fn => ({ read: fn }),
    withTiming: (target, options, completion) => ({ nativeTiming: true, target, options, completion }),
    runOnJS: fn => (...args) => { jsQueue.push(() => fn(...args)); },
    cancelAnimation: value => { value.animation = null; },
  };
  const renderer = load('components/ChestFrameRenderer.native.tsx', name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return { View: 'View', StyleSheet: { create: x => x } };
    if (name === 'expo-image') return { Image: 'PreparedImage' };
    if (name === 'react-native-reanimated') return reanimated;
    if (name === './chestAnimationData') return { CHEST_FPS: 24, CHEST_FRAME_COUNT: 73 };
    throw Error(name);
  });
  const component = load('components/ChestReveal.native.tsx', name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
    if (name === 'react-native') return {
      View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: x => x, absoluteFill: {} },
      AppState: { addEventListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } },
    };
    if (name === 'expo-image') return { Image: 'PreparedImage' };
    if (name === 'react-native-reanimated') return reanimated;
    if (name === '@/services/chestPreparation') return {
      getPreparedChest: () => cached, prepareChestAssets: () => failure ? Promise.reject(Error('Decode failed')) : Promise.resolve(cached),
    };
    if (name === '@/services/audio') return {
      prepareChestAudio: async () => {}, playPreparedChestSound: () => { plays++; }, stopSounds: () => {},
    };
    if (name === '@/services/dumplingAudio') return { playDumplingSound: () => Promise.resolve() };
    if (name === './ChestFrameRenderer.native') return renderer;
    if (name === './chestAnimationData') return { CHEST_DURATION_MS: 3042, DUMPLING_REVEAL_MS: 2458 };
    throw Error(name);
  }, {
    setTimeout: (fn, ms) => { const id = timers.size + 1; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const h = {
    get tree() { return tree; }, get renders() { return renders; }, get plays() { return plays; },
    get callbacks() { return callbacks; }, get taps() { return taps; }, cached,
    render(next = opening) {
      opening = next; index = 0; dirty = false; renders++;
      tree = component.ChestReveal({ opening, dumpling: { id: 'd', rarity: 'Rare' }, testID: 'tap',
        onPress: () => { taps++; }, onRevealed: () => { callbacks++; } });
      const batch = effects; effects = []; batch.forEach(fn => fn());
      return tree;
    },
    async flushJS() {
      jsQueue.splice(0).forEach(fn => fn());
      for (let i = 0; i < 12; i++) { await Promise.resolve(); if (dirty) h.render(); }
    },
    advanceUI(ms) {
      now += ms;
      for (const v of shared) if (v.animation) {
        const a = v.animation;
        a.elapsed += ms;
        v.number = a.start + (a.target - a.start) * Math.min(1, a.elapsed / a.options.duration);
        if (a.elapsed >= a.options.duration) { v.animation = null; a.completion?.(true); }
      }
    },
    atlasStyles() {
      const sprite = find(tree, 'chest-reveal-slot').props.children.props.children[0];
      const rendered = sprite.type(sprite.props);
      return rendered.props.children.map(atlas => atlas.type(atlas.props).props.style.at(-1).read());
    },
    emit(state) { for (const fn of listeners) fn(state); },
    retry() { failure = false; find(tree, 'chest-retry').props.onPress(); },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
  h.render();
  find(tree, 'tap').props.onLayout({ nativeEvent: { layout: { width: 324 } } });
  return h;
}

test('Android keeps reward and rim mounted before opening; clock/play start without awaiting anything and frames advance with JS blocked', async () => {
  const h = nativeHarness();
  assert.ok(find(h.tree, 'chest-revealed-artwork'), 'artwork exists even on the closed chest');
  assert.equal(find(h.tree, 'chest-revealed-artwork').props.children.props.source, h.cached.dumplings.get('d'));
  await h.flushJS();
  assert.equal(find(h.tree, 'tap').props.disabled, false);
  h.render(true);
  assert.equal(h.plays, 1, 'sound starts in the opening commit without microtask/seek');
  const before = h.renders;
  h.advanceUI(1001);
  const styles = h.atlasStyles();
  assert.equal(styles[1].opacity, 1); // frame24: sheet1, tile8
  assert.equal(styles[1].transform[1].translateY, -648);
  assert.equal(h.renders, before, 'no React render or JS tick needed for native frame progression');
  h.advanceUI(1499);
  assert.ok(find(h.tree, 'chest-revealed-artwork').props.style.at(-1).read().opacity > 0);
  assert.equal(find(h.tree, 'chest-front-rim').props.style.at(-1).read().opacity, 1);
  h.advanceUI(542);
  assert.equal(find(h.tree, 'chest-revealed-artwork').props.style.at(-1).read().opacity, 1);
  assert.equal(h.atlasStyles()[4].opacity, 1);
  assert.equal(h.callbacks, 0, 'visuals complete even if the JS completion handler is delayed');
  await h.flushJS();
  assert.equal(h.callbacks, 1);
  for (let i = 0; i < 25; i++) h.render(true);
  assert.equal(h.plays, 1);
  assert.equal(h.callbacks, 1);
  h.unmount();
});

test('native leaving/re-entry uses the same decoded refs but fresh silent animation state; cancelled work cannot complete later', async () => {
  const h = nativeHarness();
  await h.flushJS(); h.render(true); h.advanceUI(100);
  h.unmount(); h.advanceUI(10000); await h.flushJS();
  assert.equal(h.callbacks, 0);
  const next = nativeHarness();
  await next.flushJS();
  assert.equal(next.plays, 0);
  assert.equal(find(next.tree, 'chest-revealed-artwork').props.style.at(-1).read().opacity, 0);
  assert.equal(next.atlasStyles()[0].opacity, 1);
  next.unmount();
});

test('failed native preparation disables interaction; retry recovers before any opening, with no partial stage waits', async () => {
  const h = nativeHarness({ preparationFails: true });
  await h.flushJS();
  assert.ok(find(h.tree, 'chest-retry'));
  assert.equal(find(h.tree, 'tap').props.disabled, true);
  assert.equal(h.plays, 0);
  h.retry(); await h.flushJS();
  assert.equal(find(h.tree, 'chest-retry'), null);
  assert.equal(find(h.tree, 'tap').props.disabled, false);
  h.render(true); assert.equal(h.plays, 1);
  h.emit('background'); h.emit('active'); h.emit('active');
  assert.equal(h.callbacks, 1);
  h.unmount();
});

test('idle native background/foreground refreshes audio readiness without replaying or retaining a stale opening', async () => {
  const h = nativeHarness();
  await h.flushJS();
  assert.equal(find(h.tree, 'tap').props.disabled, false);
  h.emit('background'); await h.flushJS();
  assert.equal(find(h.tree, 'tap').props.disabled, true);
  h.emit('active'); await h.flushJS();
  assert.equal(find(h.tree, 'tap').props.disabled, false);
  assert.equal(h.plays, 0);
  assert.equal(h.callbacks, 0);
  h.render(true); assert.equal(h.plays, 1);
  h.unmount();
});