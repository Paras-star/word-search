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

test('decoded native cache is single-flight and bounded; re-entry does not decode any of the 73 frames or 40 rewards again', async () => {
  const decoded = [];
  const dumplings = Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, asset: 100 + i }));
  const cache = load('services/chestPreparation.ts', name => {
    if (name === 'expo-image') return { Image: { loadAsync: async (source, options) => {
      decoded.push({ source, options }); return { source, bitmap: true };
    } } };
    if (name === '@/data/dumplings') return { DUMPLINGS: dumplings };
    if (name === '@/components/chestAnimationData') return { CHEST_ATLASES: [0, 1, 2, 3, 4], CHEST_FRONT: 5, CHEST_CLOSED: 6 };
    throw Error(name);
  });
  const first = cache.prepareChestAssets();
  assert.equal(cache.prepareChestAssets(), first);
  const refs = await first;
  assert.equal(decoded.length, 47);
  assert.equal(decoded[0].source, 6, 'small closed frame is decoded before any opening resources');
  assert.equal(refs.atlases.length, 5);
  assert.equal(refs.dumplings.size, 40);
  assert.ok(decoded.filter(x => x.source >= 100).every(x => x.options.maxWidth === 384 && x.options.maxHeight === 384));
  for (let i = 0; i < 25; i++) assert.equal(await cache.prepareChestAssets(), refs);
  assert.equal(decoded.length, 47);
  assert.equal(cache.getPreparedChest(), refs);
  assert.equal((await cache.prepareClosedChest()).source, 6);
  assert.equal(cache.getPreparedClosedChest().source, 6);
  assert.equal(decoded.length, 47);
});

test('cold preparation overlaps independent small images with only one atlas decoder and at most two total loads', async () => {
  let now = 0, active = 0, atlasActive = 0, peak = 0, peakAtlases = 0, done = false;
  const jobs = [];
  const calls = [];
  const cache = load('services/chestPreparation.ts', name => {
    if (name === 'expo-image') return { Image: { loadAsync: (source, options) => {
      calls.push({ source, options, at: now });
      active++; peak = Math.max(peak, active);
      if (source < 5) { atlasActive++; peakAtlases = Math.max(peakAtlases, atlasActive); }
      return new Promise(resolve => jobs.push({ at: now + 10, finish() {
        active--; if (source < 5) atlasActive--;
        resolve({ source });
      } }));
    } } };
    if (name === '@/data/dumplings') return { DUMPLINGS: Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, asset: 100 + i })) };
    if (name === '@/components/chestAnimationData') return { CHEST_ATLASES: [0, 1, 2, 3, 4], CHEST_FRONT: 5, CHEST_CLOSED: 6 };
    throw Error(name);
  });
  const pending = cache.prepareChestAssets().then(() => { done = true; });
  while (!done) {
    for (let i = 0; i < 12; i++) await Promise.resolve();
    if (!jobs.length) { assert.ok(done); break; }
    now = Math.min(...jobs.map(x => x.at));
    const ready = jobs.filter(x => x.at === now);
    for (const job of ready) { jobs.splice(jobs.indexOf(job), 1); job.finish(); }
  }
  await pending;
  assert.equal(calls.length, 47);
  assert.equal(now, 420, '10 ms simulated loads: closed + max(5 atlases, rim + 40 collectibles)');
  assert.equal(peak, 2);
  assert.equal(peakAtlases, 1);
  assert.ok(calls.filter(x => x.source >= 100).every(x => x.options.maxWidth === 384 && x.options.maxHeight === 384));
  assert.equal(calls[0].source, 6);
  await cache.prepareChestAssets();
  assert.equal(calls.length, 47, 'warm entry adds no image loads');
});

function nativeHarness({ preparationFails = false, cold = false, displayClosed = true, displayFirstFrame = true, platform = 'android' } = {}) {
  let index = 0, dirty = false, tree, effects = [], renders = 0, opening = false, now = 0;
  let callbacks = 0, plays = 0, taps = 0, failure = preparationFails;
  const hooks = [], shared = [], listeners = new Set(), timers = new Map(), jsQueue = [];
  const idleQueue = new Map(), loadedAtlases = new Set();
  let assetPreparations = 0, audioPreparations = 0;
  let nextIdle = 0, resolveAssets;
  const cached = { atlases: Array.from({ length: 5 }, (_, i) => ({ bitmap: i })), front: { bitmap: 'front' },
    dumplings: new Map([['d', { bitmap: 'dumpling' }]]) };
  const closed = { bitmap: 'closed' };
  const assetPromise = cold ? new Promise(resolve => { resolveAssets = resolve; }) : Promise.resolve(cached);
  const react = {
    useRef: value => { const n = index++; return hooks[n] ||= { current: value }; },
    useState: initial => { const n = index++; if (!hooks[n]) hooks[n] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[n].value, value => {
        hooks[n].value = typeof value === 'function' ? value(hooks[n].value) : value;
        dirty = true;
      }]; },
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
    if (name === 'react-native') return { View: 'View', Platform: { OS: platform }, StyleSheet: { create: x => x } };
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
      getPreparedChest: () => cold ? null : cached, getPreparedClosedChest: () => closed,
      prepareChestAssets: () => { assetPreparations++; return failure ? Promise.reject(Error('Decode failed')) : assetPromise; },
    };
    if (name === '@/services/chestEntryScheduling') return { afterChestDisplay: work => {
      const id = ++nextIdle; idleQueue.set(id, work);
      return () => idleQueue.delete(id);
    } };
    if (name === '@/services/audio') return {
      prepareChestAudio: async () => { audioPreparations++; }, playPreparedChestSound: () => { plays++; }, stopSounds: () => {},
    };
    if (name === '@/services/dumplingAudio') return { playDumplingSound: () => Promise.resolve() };
    if (name === './ChestFrameRenderer.native') return renderer;
    if (name === './chestAnimationData') return { CHEST_DURATION_MS: 3042, DUMPLING_REVEAL_MS: 2458, CHEST_CLOSED: 6 };
    throw Error(name);
  }, {
    setTimeout: (fn, ms) => { const id = timers.size + 1; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    requestIdleCallback: fn => { const id = ++nextIdle; idleQueue.set(id, fn); return id; },
    cancelIdleCallback: id => idleQueue.delete(id),
  });
  const h = {
    get tree() { return tree; }, get renders() { return renders; }, get plays() { return plays; },
    get callbacks() { return callbacks; }, get taps() { return taps; }, cached,
    get assetPreparations() { return assetPreparations; }, get audioPreparations() { return audioPreparations; },
    render(next = opening) {
      opening = next; index = 0; dirty = false; renders++;
      tree = component.ChestReveal({ opening, dumpling: { id: 'd', rarity: 'Rare' }, testID: 'tap',
        onPress: () => { taps++; }, onRevealed: () => { callbacks++; } });
      const batch = effects; effects = []; batch.forEach(fn => fn());
      return tree;
    },
    async flushJS({ idle = true, paint = true } = {}) {
      jsQueue.splice(0).forEach(fn => fn());
      for (let i = 0; i < 24; i++) {
        await Promise.resolve();
        if (idle) h.idleTurn();
        if (dirty) h.render();
        if (paint) h.loadAtlases();
      }
    },
    displayClosed() { find(tree, 'chest-closed-frame').props.children.props.onDisplay(); },
    displayFirstAtlasFrame() {
      const sprite = find(tree, 'chest-reveal-slot').props.children[0];
      const native = sprite.props.children[0];
      const rendered = native.type(native.props);
      const atlas = rendered.props.children.find(child => child.props.index === 0);
      atlas.type(atlas.props).props.children.props.onDisplay();
    },
    resolvePreparation() { resolveAssets?.(cached); },
    idleTurn() {
      const batch = [...idleQueue.values()]; idleQueue.clear(); batch.forEach(fn => fn());
    },
    get pendingIdle() { return idleQueue.size; },
    get rendererCount() {
      const sprite = find(tree, 'chest-reveal-slot').props.children[0];
      return sprite ? sprite.props.children[0].props.atlases.length : 0;
    },
    loadAtlases() {
      const sprite = find(tree, 'chest-reveal-slot').props.children[0];
      if (!sprite) return;
      const native = sprite.props.children[0];
      const rendered = native.type(native.props);
      for (const atlas of rendered.props.children) if (!loadedAtlases.has(atlas.props.index)) {
        loadedAtlases.add(atlas.props.index);
        const image = atlas.type(atlas.props).props.children;
        // The first cropped atlas frame must be displayed before opening.
        // iOS SharedRefs acknowledge readiness via onDisplay; Android also
        // needs onLoad for each progressively mounted atlas.
        if (atlas.props.index !== 0 || displayFirstFrame) image.props.onDisplay?.();
        if (platform !== 'ios') image.props.onLoad();
      }
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
    advanceTimers(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) {
        timers.delete(id); timer.fn();
      }
    },
    atlasStyles() {
      const sprite = find(tree, 'chest-reveal-slot').props.children[0].props.children[0];
      const rendered = sprite.type(sprite.props);
      return rendered.props.children.map(atlas => atlas.type(atlas.props).props.style.at(-1).read());
    },
    setClock(value) { shared[0].value = value; },
    emit(state) { for (const fn of listeners) fn(state); },
    retry() { failure = false; loadedAtlases.clear(); find(tree, 'chest-retry').props.onPress(); },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
  h.render();
  find(tree, 'tap').props.onLayout({ nativeEvent: { layout: { width: 324 } } });
  if (displayClosed) h.displayClosed();
  return h;
}

test('Android keeps reward and rim mounted before opening; clock/play start without awaiting anything and frames advance with JS blocked', async () => {
  const h = nativeHarness();
  assert.ok(find(h.tree, 'chest-closed-frame'), 'small closed chest exists on the first render');
  assert.equal(find(h.tree, 'chest-revealed-artwork'), null, 'large renderer is not mounted in the entry commit');
  await h.flushJS();
  assert.ok(find(h.tree, 'chest-revealed-artwork'), 'artwork is mounted and ready before opening');
  assert.equal(find(h.tree, 'chest-revealed-artwork').props.children.props.source, h.cached.dumplings.get('d'));
  assert.equal(find(h.tree, 'tap').props.disabled, false);
  h.render(true);
  assert.equal(h.plays, 1, 'sound starts in the opening commit without microtask/seek');
  const before = h.renders;
  h.advanceUI(1001);
  const styles = h.atlasStyles();
  assert.equal(styles[1].opacity, 1); // frame24: sheet1, tile8
  assert.equal(styles[1].top, '-200%');
  assert.equal(styles[1].left, '0%');
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

test('cold native entry shows the closed chest even while full preparation is unresolved', async () => {
  const h = nativeHarness({ cold: true });
  assert.ok(find(h.tree, 'chest-closed-frame'));
  assert.equal(h.rendererCount, 0);
  await h.flushJS();
  assert.equal(h.rendererCount, 0, 'opening assets cannot block or replace the closed visual');
  assert.equal(find(h.tree, 'tap').props.disabled, true);
  assert.equal(h.plays, 0);
  h.resolvePreparation();
  await h.flushJS();
  assert.equal(h.rendererCount, 5);
  assert.equal(find(h.tree, 'tap').props.disabled, false);
  h.unmount();
});

test('native renderer mounts incrementally only after closed-frame display, layout and idle time', async () => {
  const h = nativeHarness({ displayClosed: false });
  await h.flushJS();
  assert.equal(h.rendererCount, 0, 'no animation images before the closed chest is displayed');
  assert.equal(h.assetPreparations, 0, 'no bitmap preparation before static-chest display');
  assert.equal(h.audioPreparations, 0, 'audio readiness cannot gate the first chest visual');
  h.displayClosed();
  await h.flushJS({ idle: false, paint: false });
  assert.equal(h.rendererCount, 0, 'idle work does not run in the initial visual commit');
  assert.equal(h.pendingIdle, 1);
  h.idleTurn();
  await h.flushJS({ idle: false, paint: false });
  assert.equal(h.assetPreparations, 1);
  assert.equal(h.audioPreparations, 1);
  for (let count = 1; count <= 5; count++) {
    h.idleTurn();
    await h.flushJS({ idle: false, paint: false });
    assert.equal(h.rendererCount, count);
    assert.equal(find(h.tree, 'chest-closed-frame').props.style.at(-1).read().opacity, 1);
    assert.equal(find(h.tree, 'tap').props.disabled, true, 'tap waits for native image load confirmation');
    h.loadAtlases();
    await h.flushJS({ idle: false, paint: false });
  }
  assert.equal(find(h.tree, 'tap').props.disabled, false);
  h.render(true);
  assert.equal(h.plays, 1);
  h.advanceUI(1);
  assert.equal(find(h.tree, 'chest-closed-frame').props.style.at(-1).read().opacity, 0,
    'the cover is removed by the native clock, without a React render');
  h.unmount();
});

test('native crop stays on the closed first atlas tile until its first crop is actually displayed', async () => {
  const h = nativeHarness({ displayFirstFrame: false });
  await h.flushJS();
  assert.equal(h.rendererCount, 5);
  assert.equal(find(h.tree, 'tap').props.disabled, true, 'decoded images alone do not release the chest');
  assert.equal(find(h.tree, 'chest-closed-frame').props.style.at(-1).read().opacity, 1);
  h.displayFirstAtlasFrame();
  await h.flushJS();
  assert.equal(find(h.tree, 'tap').props.disabled, false, 'the first correctly positioned crop has now displayed');
  assert.equal(find(h.tree, 'chest-closed-frame').props.style.at(-1).read().opacity, 1);
  h.render(true);
  assert.equal(h.plays, 1);
  assert.equal(find(h.tree, 'chest-closed-frame').props.style.at(-1).read().opacity, 1,
    'the cover remains until the animation clock advances');
  h.unmount();
});

test('all 73 frame indices select one exact viewport-relative crop with no sheet-boundary gaps', async () => {
  const h = nativeHarness();
  await h.flushJS();
  const expected = [
    [0, 0], [-100, 0], [-200, 0], [-300, 0],
    [0, -100], [-100, -100], [-200, -100], [-300, -100],
    [0, -200], [-100, -200], [-200, -200], [-300, -200],
    [0, -300], [-100, -300], [-200, -300], [-300, -300],
  ];
  for (let frame = 0; frame < 73; frame++) {
    h.setClock(frame * 1000 / 24 + 0.01);
    const styles = h.atlasStyles();
    const atlasIndex = Math.floor(frame / 16);
    const [left, top] = expected[frame % 16];
    assert.equal(styles.filter(style => style.opacity === 1).length, 1, `frame ${frame} has one visible atlas`);
    assert.equal(styles[atlasIndex].left, `${left}%`, `frame ${frame} horizontal crop`);
    assert.equal(styles[atlasIndex].top, `${top}%`, `frame ${frame} vertical crop`);
    assert.ok(styles.every(style => style.left && style.top), `frame ${frame} has no unset crop origin`);
  }
  h.unmount();
});

test('leaving before idle renderer preparation cancels its scheduled mount', async () => {
  const h = nativeHarness();
  await h.flushJS({ idle: false, paint: false });
  assert.equal(h.pendingIdle, 1);
  h.unmount();
  assert.equal(h.pendingIdle, 0);
  assert.equal(h.assetPreparations, 0);
  assert.equal(h.plays, 0);
});

test('closed-frame display failures remain explicit and retry can recover the native view', async () => {
  const h = nativeHarness();
  await h.flushJS();
  find(h.tree, 'chest-closed-frame').props.children.props.onError();
  await h.flushJS();
  assert.ok(find(h.tree, 'chest-retry'));
  assert.equal(find(h.tree, 'tap').props.disabled, true);
  h.retry();
  await h.flushJS();
  assert.equal(h.rendererCount, 0, 'retry waits for the remounted closed image to display');
  h.displayClosed();
  await h.flushJS();
  assert.equal(find(h.tree, 'tap').props.disabled, false);
  assert.equal(h.plays, 0);
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

test('iOS decoded-image display events enable the chest and complete the original reveal exactly once', async () => {
  const h = nativeHarness({ platform: 'ios' });
  await h.flushJS();
  assert.equal(h.rendererCount, 5, 'all five decoded atlases must prepare without iOS onLoad events');
  assert.equal(find(h.tree, 'tap').props.disabled, false);
  find(h.tree, 'tap').props.onPress();
  assert.equal(h.taps, 1);
  h.render(true);
  assert.equal(h.plays, 1);
  h.advanceUI(2500);
  assert.ok(find(h.tree, 'chest-revealed-artwork').props.style.at(-1).read().opacity > 0);
  h.advanceUI(542);
  await h.flushJS();
  assert.equal(h.callbacks, 1);
  h.advanceTimers(6000);
  h.emit('active');
  await h.flushJS();
  assert.equal(h.callbacks, 1);
  assert.equal(h.plays, 1);
  h.unmount();
});

test('iOS reveal fallback and app resume release completion once; unmount cancels pending completion', async () => {
  for (const completion of ['timeout', 'resume', 'unmount']) {
    const h = nativeHarness({ platform: 'ios' });
    await h.flushJS();
    assert.equal(find(h.tree, 'tap').props.disabled, false);
    h.render(true);
    h.advanceUI(100);
    if (completion === 'unmount') h.unmount();
    else if (completion === 'resume') { h.emit('inactive'); h.emit('active'); }
    h.advanceTimers(6000);
    h.advanceUI(6000);
    await h.flushJS();
    assert.equal(h.callbacks, completion === 'unmount' ? 0 : 1);
    if (completion !== 'unmount') h.unmount();
  }
});