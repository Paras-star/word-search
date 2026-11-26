const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, req) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', code)(req, module, module.exports);
  return module.exports;
}

function harness(platform = 'web') {
  const slots = [];
  let cursor = 0, pendingEffects = [], writes = 0;
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { writes++; slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }];
    },
    useEffect(callback, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((x, n) => x !== old.deps[n])) {
        pendingEffects.push(() => {
          old?.cleanup?.();
          slots[i] = { deps, cleanup: callback() };
        });
      }
    },
  };
  const refs = { animals: null, night: null }, loads = { animals: 0, night: 0 };
  const requests = {};
  const service = kind => ({
    [`${kind === 'animals' ? 'ANIMALS' : 'NIGHT'}_BACKGROUND_SOURCE`]: `${kind}.png`,
    [`getPrepared${kind === 'animals' ? 'Animal' : 'Night'}Background`]: () => refs[kind],
    [`prepare${kind === 'animals' ? 'Animal' : 'Night'}Background`]: () => {
      if (refs[kind]) return Promise.resolve(refs[kind]);
      if (requests[kind]) return requests[kind].promise;
      loads[kind]++;
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; }).then(image => {
        refs[kind] = image; return image;
      }).catch(error => { delete requests[kind]; throw error; });
      requests[kind] = { promise, resolve, reject };
      return promise;
    },
  });
  const hook = load('hooks/usePreparedBackground.ts', name => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Platform: { OS: platform } };
    if (name === '@/services/animalBackgroundPreparation') return service('animals');
    if (name === '@/services/nightBackgroundPreparation') return service('night');
    throw Error(name);
  }).usePreparedBackground;
  return {
    render(kind) { cursor = 0; const value = hook(kind); const effects = pendingEffects; pendingEffects = []; effects.forEach(fn => fn()); return value; },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
    requests, refs, loads, get writes() { return writes; },
  };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('web background consumers display the one retained result without a competing source request', async () => {
  const h = harness();
  assert.equal(h.render('night'), undefined);
  assert.equal(h.loads.night, 1);
  const image = { uri: 'blob:night' };
  h.requests.night.resolve(image);
  await flush();
  assert.equal(h.render('night'), image);
  assert.equal(h.render('night'), image);
  assert.equal(h.loads.night, 1);
});

test('native cold entry retains the immediate original image then adopts the shared reference', async () => {
  const h = harness('android');
  assert.equal(h.render('animals'), 'animals.png');
  const image = { bitmap: 'animals' };
  h.requests.animals.resolve(image);
  await flush();
  assert.equal(h.render('animals'), image);
});

test('departed screens cannot install a late result but preparation remains reusable', async () => {
  const h = harness();
  h.render('night');
  h.unmount();
  h.requests.night.resolve({ uri: 'blob:retained' });
  await flush();
  assert.equal(h.writes, 0);
  assert.equal(h.refs.night.uri, 'blob:retained');
});

test('changing background kind never flashes the previous artwork during preparation', async () => {
  const h = harness('android');
  h.render('night');
  h.requests.night.resolve({ bitmap: 'night' });
  await flush();
  assert.equal(h.render('animals'), 'animals.png');
  h.requests.animals.resolve({ bitmap: 'animals' });
  await flush();
  assert.equal(h.render('animals').bitmap, 'animals');
});

test('failed web preparation exposes the original artwork rather than leaving a permanently empty background', async () => {
  const h = harness();
  h.render('night');
  h.requests.night.reject(Error('controlled unavailable image'));
  await flush();
  assert.equal(h.render('night'), 'night.png');
});

test('screen activity suspends collection animation on blur and background and unsubscribes on unmount', () => {
  const values = [];
  let cursor = 0, focus, listener, removed = 0;
  const cleanups = [];
  const useScreenActivity = load('hooks/useScreenActivity.ts', name => {
    if (name === 'react') return {
      useState(initial) {
        const i = cursor++;
        if (!(i in values)) values[i] = initial;
        return [values[i], next => { values[i] = next; }];
      },
      useCallback: fn => fn,
      useEffect(fn) { if (!cleanups.length) cleanups.push(fn()); },
    };
    if (name === 'react-native') return { AppState: {
      currentState: 'active',
      addEventListener(_, fn) { listener = fn; return { remove() { removed++; } }; },
    } };
    if (name === 'expo-router') return { useFocusEffect(fn) { focus = fn; } };
    throw Error(name);
  }).useScreenActivity;
  const render = () => { cursor = 0; return useScreenActivity(); };
  assert.equal(render(), false);
  const blur = focus();
  assert.equal(render(), true);
  listener('background');
  assert.equal(render(), false);
  listener('active');
  assert.equal(render(), true);
  blur();
  assert.equal(render(), false);
  cleanups.forEach(fn => fn());
  assert.equal(removed, 1);
});

test('Daily refresh and six staggered puzzle preparations stop when their focus callbacks clean up', () => {
  const source = fs.readFileSync(path.join(root, 'app/daily.tsx'), 'utf8');
  const ast = ts.createSourceFile('daily.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useFocusEffect') {
      callbacks.push(node.arguments[0].arguments[0].getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(callbacks.length, 2);
  let refreshed = 0, removed = 0, clearedInterval = 0;
  const setters = [];
  const intervals = [], timers = [], cleared = [], generated = [];
  const args = {
    setNow(fn) { refreshed++; setters.push(fn); },
    localDateKey: value => value.toDateString(),
    setInterval(fn, ms) { intervals.push({ fn, ms }); return 42; },
    clearInterval(id) { clearedInterval = id; },
    AppState: { addEventListener() { return { remove() { removed++; } }; } },
    dailyWindow: () => ['a', 'b', 'c', 'd', 'e', 'f'],
    now: new Date(2026, 10, 26),
    setTimeout(fn, ms) { timers.push({ fn, ms }); return timers.length; },
    clearTimeout(id) { cleared.push(id); },
    getDailyPuzzle(key) { generated.push(key); },
  };
  const create = text => new Function(...Object.keys(args), `return (${text});`)(...Object.values(args));
  const refreshCleanup = create(callbacks[0])();
  assert.equal(refreshed, 1, 'returning to Calendar refreshes date eligibility immediately');
  const sameDay = new Date();
  assert.equal(setters[0](sameDay), sameDay, 'same-day focus does not invalidate every calendar cell');
  const previousDay = new Date(Date.now() - 86400000);
  assert.notEqual(setters[0](previousDay), previousDay, 'a new local date still refreshes eligibility');
  assert.equal(intervals[0].ms, 60000);
  refreshCleanup();
  assert.equal(clearedInterval, 42);
  assert.equal(removed, 1);
  const prepareCleanup = create(callbacks[1])();
  assert.deepEqual(timers.map(x => x.ms), [0, 50, 100, 150, 200, 250]);
  timers[0].fn();
  assert.deepEqual(generated, ['f']);
  prepareCleanup();
  assert.deepEqual(cleared, [1, 2, 3, 4, 5, 6]);
});
