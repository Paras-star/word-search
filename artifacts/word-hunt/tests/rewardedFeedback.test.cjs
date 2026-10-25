const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Exercise actual hook callbacks/state transitions without a native SDK or browser.
function harness() {
  const states = [], refs = [], timers = [];
  let stateIndex = 0, refIndex = 0, subscribed, effectMounted = false;
  let ready = false, calls = 0, result = 'unavailable', reject = false;
  const react = {
    useRef(initial) {
      const index = refIndex++;
      refs[index] ??= { current: initial };
      return refs[index];
    },
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useCallback: fn => fn,
    useEffect(fn) {
      if (!effectMounted) { effectMounted = true; fn(); }
    },
  };
  const ads = {
    isRewardedLoading: () => false,
    isRewardedReady: () => ready,
    prepareAds: async () => {},
    subscribeToAds(fn) { subscribed = fn; return () => {}; },
    async watchRewarded() {
      calls++;
      if (reject) throw new Error('presentation failed');
      return result;
    },
  };
  const compiled = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, '../hooks/useRewardedAd.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const exports = {};
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', compiled)(
    name => {
      if (name === 'react') return react;
      if (name === '@/services/ads') return ads;
      throw new Error(`Unexpected import ${name}`);
    }, exports,
    callback => { const timer = { callback, cancelled: false }; timers.push(timer); return timer; },
    timer => { if (timer) timer.cancelled = true; },
  );
  return {
    render() { stateIndex = 0; refIndex = 0; return exports.useRewardedAd('home-coins'); },
    setReady(value) { ready = value; subscribed(); },
    setResult(value) { result = value; },
    failPresentation() { reject = true; },
    calls: () => calls,
    timers,
  };
}

test('dismissing unavailable feedback restores the action, cancels its timer and never requests or grants a reward', async () => {
  const h = harness();
  let grants = 0;
  await h.render().watch(() => grants++);
  assert.equal(h.render().status, 'unavailable');
  h.render().dismiss();
  assert.equal(h.render().status, 'idle');
  assert.equal(h.timers[0].cancelled, true);
  assert.equal(h.calls(), 1);
  assert.equal(grants, 0);
});

test('a ready notification immediately restores an unavailable reward button', async () => {
  const h = harness();
  await h.render().watch(() => assert.fail('Unavailable ads cannot earn'));
  assert.equal(h.render().status, 'unavailable');
  h.setReady(true);
  assert.equal(h.render().ready, true);
  assert.equal(h.render().status, 'idle');
});

test('an ad that becomes ready while an unavailable result is settling does not leave a stale message', async () => {
  const h = harness();
  const pending = h.render().watch(() => assert.fail('Unavailable ads cannot earn'));
  h.setReady(true);
  await pending;
  assert.equal(h.render().ready, true);
  assert.equal(h.render().status, 'idle');
});

test('the existing automatic feedback dismissal also restores the reward button', async () => {
  const h = harness();
  await h.render().watch(() => assert.fail('Unavailable ads cannot earn'));
  assert.equal(h.render().status, 'unavailable');
  h.timers[0].callback();
  assert.equal(h.render().status, 'idle');
});

test('unexpected presentation failure uses unavailable feedback, not a successful reward', async () => {
  const h = harness();
  h.failPresentation();
  let grants = 0;
  await h.render().watch(() => grants++);
  assert.equal(h.render().status, 'unavailable');
  assert.equal(grants, 0);
});

test('ad readiness never clears successful or failed-save feedback', async () => {
  for (const [result, status] of [['earned', 'earned'], ['save-failed', 'failed']]) {
    const h = harness();
    h.setResult(result);
    await h.render().watch(() => {});
    h.setReady(true);
    assert.equal(h.render().status, status);
  }
});
