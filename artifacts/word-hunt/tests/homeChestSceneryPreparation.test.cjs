const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ idleSupported = true, loader } = {}) {
  let appState = 'active', nextHandle = 0, now = 0;
  const timers = new Map(), idle = new Map(), listeners = new Set();
  const loads = [], warnings = [];
  const appStateApi = {
    get currentState() { return appState; },
    addEventListener(_event, callback) {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    },
    change(state) {
      appState = state;
      for (const listener of [...listeners]) listener(state);
    },
  };
  const fakeGlobal = {};
  if (idleSupported) {
    fakeGlobal.requestIdleCallback = (callback, options) => {
      const id = ++nextHandle;
      idle.set(id, { callback, options });
      return id;
    };
    fakeGlobal.cancelIdleCallback = id => idle.delete(id);
  }
  const setTimer = (callback, delay = 0) => {
    const id = ++nextHandle;
    timers.set(id, { callback, at: now + Number(delay) });
    return id;
  };
  const clearTimer = id => timers.delete(id);
  const module = { exports: {} };
  const sceneryService = { exports: {} };
  let decoded = null;
  class WebImage {
    set src(value) { this.uri = value; }
    decode() { return decoded?.promise ?? Promise.resolve(); }
  }
  new Function('require', 'module', 'exports', 'globalThis', 'URL', 'console',
    compile(read('services/chestSceneryPreparation.ts')))(
    name => {
      if (name === 'expo-image') return { Image: { loadAsync: (...args) => {
        loads.push(args);
        return loader ? loader(...args, loads.length) : Promise.resolve({ uri: 'blob:chest' });
      } } };
      if (name === 'react-native') return { Platform: { OS: 'web' } };
      if (name.endsWith('chest-background.png')) return 789;
      throw Error(`Unexpected scenery dependency ${name}`);
    }, sceneryService, sceneryService.exports, { Image: WebImage }, { revokeObjectURL() {} },
    { warn: (...args) => warnings.push(args) },
  );
  new Function('require', 'module', 'exports', 'AppState', 'warmChestScenery',
    'globalThis', 'setTimeout', 'clearTimeout', compile(read('services/homeChestSceneryPreparation.ts')))(
    name => {
      if (name === 'react-native') return { AppState: appStateApi };
      if (name === '@/services/chestSceneryPreparation') return sceneryService.exports;
      throw Error(`Unexpected scheduler dependency ${name}`);
    }, module, module.exports, appStateApi, sceneryService.exports.warmChestScenery,
    fakeGlobal, setTimer, clearTimer,
  );
  return {
    api: { ...sceneryService.exports }, loads, warnings, timers, idle, listeners,
    prepare: module.exports.scheduleHomeChestSceneryPreparation,
    setDecode(value) { decoded = value; },
    advance(ms) {
      now += ms;
      let ran = true;
      while (ran) {
        ran = false;
        for (const [id, timer] of [...timers]) {
          if (timer.at <= now) {
            timers.delete(id);
            timer.callback();
            ran = true;
          }
        }
      }
    },
    runIdle() {
      const callbacks = [...idle.values()];
      idle.clear();
      callbacks.forEach(({ callback }) => callback({ didTimeout: false, timeRemaining: () => 10 }));
    },
    changeAppState: state => appStateApi.change(state),
  };
}

async function flushMicrotasks() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

async function startIdlePreparation(h) {
  const loadsBefore = h.loads.length;
  h.advance(799);
  assert.equal(h.loads.length, loadsBefore, 'must not start work during the Home settling delay');
  h.advance(1);
  assert.equal(h.loads.length, loadsBefore, 'idle callback has not run yet');
  assert.equal(h.idle.size, 1);
  h.runIdle();
  await flushMicrotasks();
}

test('cold first Home visit waits for the screen to settle, then starts non-blocking idle preparation', async () => {
  const load = deferred();
  const h = harness({ loader: () => load.promise });
  const cancel = h.prepare();
  assert.equal(h.loads.length, 0, 'Home renders before any scenery load starts');
  await startIdlePreparation(h);
  assert.equal(h.loads.length, 1);
  assert.equal(h.api.getPreparedChestScenery(), null, 'pending preparation does not gate the screen');
  load.resolve({ uri: 'blob:cold-chest' });
  await flushMicrotasks();
  assert.equal(h.api.getPreparedChestScenery().uri, 'blob:cold-chest');
  cancel();
});

test('successful idle preparation is retained and later warm Home visits do not reload', async () => {
  const image = { uri: 'blob:warm-chest' };
  const h = harness({ loader: () => Promise.resolve(image) });
  const first = h.prepare();
  await startIdlePreparation(h);
  assert.equal(h.api.getPreparedChestScenery(), image);
  assert.equal(h.loads.length, 1);
  first();
  const cancel = h.prepare();
  await startIdlePreparation(h);
  assert.equal(h.loads.length, 1, 'the existing retained result is reused on a warm visit');
  cancel();
});

test('Home focus cleanup cancels both the settling timer and a queued idle callback', async () => {
  const h = harness();
  const blur = h.prepare();
  blur();
  h.advance(1000);
  h.runIdle();
  await flushMicrotasks();
  assert.equal(h.loads.length, 0);
  assert.equal(h.idle.size, 0);
  assert.equal(h.listeners.size, 0, 'focus cleanup removes the app-state listener');

  const second = harness();
  const unmount = second.prepare();
  second.advance(800);
  assert.equal(second.idle.size, 1);
  unmount();
  second.runIdle();
  assert.equal(second.loads.length, 0, 'unmount cancels an already queued idle callback');
});

test('backgrounding cancels pending idle work and foregrounding schedules a fresh attempt', async () => {
  const h = harness();
  const cancel = h.prepare();
  h.changeAppState('inactive');
  h.advance(1000);
  h.runIdle();
  assert.equal(h.loads.length, 0);
  h.changeAppState('active');
  await startIdlePreparation(h);
  assert.equal(h.loads.length, 1);
  cancel();
});

test('a failed idle attempt releases the single-flight loader so a later Home visit retries', async () => {
  let fail = true;
  const image = { uri: 'blob:retry-chest' };
  const h = harness({ loader: () => {
    if (fail) return Promise.reject(Error('offline'));
    return Promise.resolve(image);
  } });
  const first = h.prepare();
  await startIdlePreparation(h);
  await flushMicrotasks();
  assert.equal(h.api.getPreparedChestScenery(), null);
  assert.equal(h.warnings.length, 1);
  first();
  fail = false;
  const second = h.prepare();
  await startIdlePreparation(h);
  assert.equal(h.loads.length, 2);
  assert.equal(h.api.getPreparedChestScenery(), image);
  second();
});

test('Safari fallback yields past the settling delay without requestIdleCallback', async () => {
  const h = harness({ idleSupported: false });
  const cancel = h.prepare();
  h.advance(799);
  assert.equal(h.loads.length, 0);
  h.advance(1);
  assert.equal(h.loads.length, 1, 'timer fallback starts only after Home has settled');
  await flushMicrotasks();
  assert.ok(h.api.getPreparedChestScenery());
  cancel();
});
