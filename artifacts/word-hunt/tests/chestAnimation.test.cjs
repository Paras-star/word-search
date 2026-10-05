const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function find(tree, id) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.props?.testID === id) return tree;
  return [tree.props?.children].flat().map(child => find(child, id)).find(Boolean) ?? null;
}
function sprite(tree) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.type === 'Sprite') return tree;
  return [tree.props?.children].flat().map(sprite).find(Boolean) ?? null;
}

async function harness({ decode = true, soundStalls = false, assetFails = false, assetStalls = false, displayClosed = true } = {}) {
  let now = 0, tick = 0, index = 0, hooks = [], effects = [], dirty = false;
  let opening = false, callbackCount = 0, taps = 0, tree, resolveSound;
  const timers = new Map(), calls = [], appListeners = new Set();
  let assetLoads = 0, resolveAssets;
  const stalledAssets = new Promise(resolve => { resolveAssets = resolve; });
  const idleQueue = new Map();
  let idleId = 0;
  const schedule = (cb, duration) => {
    const id = ++tick; timers.set(id, { at: now + duration, cb }); return id;
  };
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
  }
  const react = {
    useRef: initial => { const slot = index++; return hooks[slot] ??= { current: initial }; },
    useState: initial => {
      const slot = index++, state = hooks[slot] ??= { value: initial };
      return [state.value, value => {
        const next = typeof value === 'function' ? value(state.value) : value;
        if (state.value !== next) { state.value = next; dirty = true; }
      }];
    },
    useCallback: (callback, deps) => {
      const slot = index++, old = hooks[slot];
      if (!old || deps.some((d, i) => d !== old.deps[i])) hooks[slot] = { deps, callback };
      return hooks[slot].callback;
    },
    useEffect: (effect, deps) => {
      const slot = index++, old = hooks[slot];
      if (!old || deps.some((d, i) => d !== old.deps[i])) {
        effects.push(() => { old?.cleanup?.(); hooks[slot] = { deps, cleanup: effect() }; });
      }
    },
  };
  const native = {
    Platform: { OS: 'android' },
    Animated: { Value, View: 'AnimatedView', timing: (value, options) => {
      let id;
      return { start: () => { id = schedule(() => value.setValue(options.toValue), options.duration); }, stop: () => timers.delete(id) };
    } },
    AppState: { addEventListener: (_event, cb) => {
      appListeners.add(cb); return { remove: () => appListeners.delete(cb) };
    } },
    StyleSheet: { create: styles => styles, absoluteFill: {} },
    View: 'View', Image: 'Image', Pressable: 'Pressable', Text: 'Text',
  };
  const output = ts.transpileModule(fs.readFileSync(path.join(root, 'components/ChestReveal.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', 'Date', output)(name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (name === 'react-native') return native;
    if (name === 'expo-asset') return { Asset: { loadAsync: async sources => {
      assetLoads++;
      assert.equal(sources.length, 6);
      if (assetFails) throw Error('Asset unavailable');
      if (assetStalls) await stalledAssets;
      return sources;
    } } };
    if (name === '@/services/chestEntryScheduling') return { afterChestDisplay: work => {
      const id = ++idleId; idleQueue.set(id, work);
      return () => idleQueue.delete(id);
    } };
    if (name === './ChestFrameRenderer') return { ChestFrameRenderer: 'Sprite' };
    if (name === './chestAnimationData') return {
      CHEST_ATLASES: [0, 1, 2, 3, 4], CHEST_FRONT: 'front.png', CHEST_CLOSED: 'closed.png',
      CHEST_DURATION_MS: 3042, CHEST_FPS: 24, CHEST_FRAME_COUNT: 73, DUMPLING_REVEAL_MS: 2458,
    };
    if (name === '@/services/audio') return {
      startSound: event => {
        calls.push([event, now]);
        return soundStalls ? new Promise(resolve => { resolveSound = resolve; }) : Promise.resolve();
      },
      stopSounds: events => calls.push(['stop', events, now]),
    };
    if (name === '@/services/dumplingAudio') return { playDumplingSound: (event, rarity) => {
      calls.push([event, rarity, now]); return Promise.resolve();
    } };
    throw Error(`Unexpected import ${name}`);
  }, m, m.exports, schedule, id => timers.delete(id), { now: () => now });
  const dumpling = { id: 'moon-dumpling', name: 'Moon Dumpling', rarity: 'Rare', asset: 'moon.png' };
  const onPress = () => { taps++; };
  const onRevealed = () => { callbackCount++; };
  const h = {
    calls,
    get tree() { return tree; },
    get callbackCount() { return callbackCount; },
    get taps() { return taps; },
    get assetLoads() { return assetLoads; },
    get pendingIdle() { return idleQueue.size; },
    displayClosed() { find(tree, 'chest-closed-frame').props.onLoad(); },
    resolveAssets() { resolveAssets(); },
    render(next = opening) {
      opening = next; dirty = false; index = 0;
      tree = m.exports.ChestReveal({ opening, dumpling, onRevealed, onPress, testID: 'test-chest-tap' });
      const pending = effects; effects = []; pending.forEach(run => run());
      return tree;
    },
    async flush({ idle = true } = {}) {
      for (let i = 0; i < 12; i++) {
        await Promise.resolve();
        if (idle) { const batch = [...idleQueue.values()]; idleQueue.clear(); batch.forEach(work => work()); }
        if (dirty) h.render();
      }
    },
    decode() { sprite(tree)?.props.onReady(); find(tree, 'chest-front-rim')?.props.onLoad(); },
    advance(duration) {
      const until = now + duration;
      while (true) {
        const due = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].cb();
        if (dirty) h.render();
      }
      now = until;
    },
    emit: state => { appListeners.forEach(cb => cb(state)); if (dirty) h.render(); },
    resolveSound: () => resolveSound?.(),
    retryAssets: () => { assetFails = false; find(tree, 'chest-retry').props.onPress(); },
    unmount: () => hooks.forEach(hook => hook?.cleanup?.()),
  };
  h.render(false);
  if (displayClosed) h.displayClosed();
  await h.flush();
  if (decode) { h.decode(); await h.flush(); }
  return h;
}

test('fallback first render includes the exact static chest and does not start animation loading before display', async () => {
  const h = await harness({ displayClosed: false, decode: false });
  assert.equal(find(h.tree, 'chest-closed-frame').props.source, 'closed.png');
  assert.equal(h.assetLoads, 0);
  assert.equal(sprite(h.tree), null);
  assert.doesNotMatch(JSON.stringify(h.tree), /Loading chest/);
  h.displayClosed();
  await h.flush({ idle: false });
  assert.equal(h.assetLoads, 0, 'asset loading yields the initial chest paint');
  h.unmount();
  assert.equal(h.pendingIdle, 0, 'rapid exit cancels queued initialization');
});

test('five seconds of unresolved animation assets cannot hide the already-visible static chest', async () => {
  const h = await harness({ assetStalls: true, decode: false });
  assert.equal(h.assetLoads, 1);
  assert.equal(sprite(h.tree), null);
  h.advance(5000); await h.flush();
  const closed = find(h.tree, 'chest-closed-frame');
  assert.equal(closed.props.source, 'closed.png');
  assert.equal(closed.props.style.at(-1).opacity, 1);
  assert.equal(find(h.tree, 'test-chest-tap').props.disabled, true);
  assert.doesNotMatch(JSON.stringify(h.tree), /Loading chest/);
  h.resolveAssets(); await h.flush(); h.decode(); await h.flush();
  assert.equal(find(h.tree, 'test-chest-tap').props.disabled, false);
  h.render(true); await h.flush(); h.advance(3042);
  assert.equal(sprite(h.tree).props.frame, 72);
  assert.equal(find(h.tree, 'chest-closed-frame').props.style.at(-1).opacity, 0);
  assert.equal(h.callbackCount, 1);
  h.unmount();
});

test('closed frame is interactive only after every atlas and front rim decode; idle is silent', async () => {
  const h = await harness({ decode: false });
  assert.equal(find(h.tree, 'test-chest-tap').props.disabled, true);
  h.decode(); await h.flush();
  assert.equal(find(h.tree, 'test-chest-tap').props.disabled, false);
  find(h.tree, 'test-chest-tap').props.onPress();
  assert.equal(h.taps, 1);
  h.advance(10000);
  assert.equal(sprite(h.tree).props.frame, 0);
  assert.deepEqual(h.calls, []);
  h.unmount();
});

test('exact source frame clock starts with extracted audio; open chest remains behind the inside dumpling', async () => {
  const h = await harness();
  h.render(true); await h.flush();
  assert.deepEqual(h.calls, [['chestOpening', 0]]);
  assert.equal(find(h.tree, 'test-chest-tap').props.disabled, true);
  h.advance(1000);
  assert.ok(Math.abs(sprite(h.tree).props.frame - 24) <= 1);
  assert.equal(find(h.tree, 'chest-revealed-artwork'), null);
  h.advance(1500);
  assert.ok(sprite(h.tree).props.frame >= 59);
  assert.ok(find(h.tree, 'chest-revealed-artwork'));
  assert.equal(find(h.tree, 'chest-front-rim').props.style.at(-1).opacity, 1);
  assert.deepEqual(find(h.tree, 'chest-front-rim').props.style[1], { width: '100%', height: '100%' }, 'rim must match the frame viewport, not the PNG intrinsic dimensions');
  assert.equal(h.callbackCount, 0);
  h.advance(542);
  assert.equal(sprite(h.tree).props.frame, 72, 'open chest stays in final composition');
  assert.equal(find(h.tree, 'chest-revealed-artwork').props.style.at(-1).opacity.value, 1);
  assert.equal(h.callbackCount, 1);
  assert.equal(h.calls.filter(c => c[0] === 'rarityReveal').length, 1);
  assert.equal(h.calls.some(c => ['opening', 'reveal'].includes(c[0])), false);
  h.render(true); h.advance(10000);
  assert.equal(h.calls.filter(c => c[0] === 'chestOpening').length, 1);
  assert.equal(h.callbackCount, 1);
  h.unmount();
});

test('foreground completion keeps the open chest, fully shows the inside reward, and never replays audio', async () => {
  const h = await harness();
  h.render(true); await h.flush(); h.advance(2500);
  h.emit('background'); h.emit('active');
  assert.equal(h.callbackCount, 1);
  assert.equal(sprite(h.tree).props.frame, 72);
  assert.equal(find(h.tree, 'chest-revealed-artwork').props.style.at(-1).opacity.value, 1);
  h.advance(10000); h.emit('active');
  assert.equal(h.callbackCount, 1);
  assert.equal(h.calls.filter(c => c[0] === 'chestOpening').length, 1);
  h.unmount();
});

test('bounded fallback finishes a stalled sound start and ignores its late response', async () => {
  const h = await harness({ soundStalls: true });
  h.render(true); await h.flush();
  h.advance(5999); assert.equal(h.callbackCount, 0);
  h.advance(1); assert.equal(h.callbackCount, 1);
  assert.equal(sprite(h.tree).props.frame, 72);
  h.resolveSound(); await h.flush(); h.advance(10000);
  assert.equal(h.callbackCount, 1);
  h.unmount();
});

test('missing assets prevent interaction and opening until a visible retry succeeds', async () => {
  const h = await harness({ assetFails: true, decode: false });
  assert.ok(find(h.tree, 'chest-retry'));
  assert.equal(find(h.tree, 'test-chest-tap').props.disabled, true);
  h.retryAssets(); await h.flush(); h.decode(); await h.flush();
  assert.equal(find(h.tree, 'chest-retry'), null);
  assert.equal(find(h.tree, 'test-chest-tap').props.disabled, false);
  assert.deepEqual(h.calls, []);
  h.unmount();
});

test('unmount cancels clocks/fade/audio and cannot issue late rarity or completion', async () => {
  const h = await harness();
  h.render(true); await h.flush(); h.advance(100);
  h.unmount(); h.advance(10000); h.emit('active');
  assert.equal(h.callbackCount, 0);
  assert.equal(h.calls.filter(c => c[0] === 'rarityReveal').length, 0);
  assert.ok(h.calls.some(c => c[0] === 'stop' && c[1].includes('chestOpening')));
});