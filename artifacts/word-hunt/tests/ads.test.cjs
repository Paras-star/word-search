const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness(options = {}) {
  const created = { rewarded: [], interstitial: [] };
  const events = { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error', EARNED_REWARD: 'earned', OPENED: 'opened', IMPRESSION: 'impression' };
  const stats = { gather: 0, cached: 0, initialized: 0, privacyForms: 0 };
  const logs = [];
  const clock = { now: Date.now() };
  const timers = [];
  const schedule = options.fakeTimers
    ? (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    }
    : setTimeout;
  const cancel = options.fakeTimers ? (timer) => { if (timer) timer.cancelled = true; } : clearTimeout;
  const info = options.info ?? { canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' };
  function makeAd(kind, unitId) {
    const callbacks = new Map();
    const ad = {
      loaded: false,
      unitId,
      showCalls: 0,
      addAdEventListener(event, callback) {
        if (!callbacks.has(event)) callbacks.set(event, new Set());
        callbacks.get(event).add(callback);
        return () => callbacks.get(event).delete(callback);
      },
      emit(event, payload) { for (const callback of [...(callbacks.get(event) ?? [])]) callback(payload); },
      load() {
        if (options.loadThrows) throw { code: 'network-error' };
        if (options.autoLoad !== false) { this.loaded = true; this.emit(events.LOADED); }
      },
      show() {
        this.showCalls++;
        if (options.showThrows === kind) throw { code: 'show-failed' };
        if (options.showRejects === kind) return Promise.reject({ code: 'show-failed' });
        return kind === 'interstitial' && options.interstitialShowNeverSettles
          ? new Promise(() => {}) : Promise.resolve();
      },
      destroy() {
        this.destroyed = true;
        if (options.cleanupThrows) throw new Error('native cleanup');
      },
    };
    created[kind].push(ad);
    return ad;
  }
  const sdk = {
    default: () => ({ initialize: async () => {
      stats.initialized++;
      if (options.initializeError || stats.initialized <= (options.initializeFailures ?? 0)) throw new Error('AdMob initialization failed');
      return [];
    } }),
    AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: 'REQUIRED' },
    AdsConsent: {
      gatherConsent: async () => {
        stats.gather++;
        if (options.gatherError) throw new Error('consent network unavailable');
        return info;
      },
      getConsentInfo: async () => {
        stats.cached++;
        if (options.cachedError) throw new Error('consent state unavailable');
        return info;
      },
      showPrivacyOptionsForm: async () => {
        stats.privacyForms++;
        return options.privacyResult ?? info;
      },
    },
    TestIds: { BANNER: 'test-banner', INTERSTITIAL: 'test-interstitial', REWARDED: 'test-rewarded' },
    AdEventType: events,
    RewardedAdEventType: events,
    InterstitialAd: { createForAdRequest: (id) => makeAd('interstitial', id) },
    RewardedAd: { createForAdRequest: (id) => makeAd('rewarded', id) },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../services/ads.native.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const mockRequire = (name) => {
    if (name === 'react-native') return { Platform: { OS: 'android' } };
    if (name === 'expo-constants') return { __esModule: true, default: { executionEnvironment: 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } };
    if (name === './adConfig') return { ANDROID_AD_UNITS: { banner: 'live-banner', interstitial: 'live-interstitial', rewarded: 'live-rewarded' }, REWARDED_COINS: 50, INTERSTITIAL_EVERY_PUZZLES: 3, MIN_INTERSTITIAL_INTERVAL_MS: 120000 };
    if (name === 'react-native-google-mobile-ads') return sdk;
    if (name === './adDiagnostics') {
      const diagnostics = { exports: {} };
      const source = fs.readFileSync(path.resolve(__dirname, '../services/adDiagnostics.ts'), 'utf8');
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
      new Function('exports', 'setTimeout', 'console', compiled)(
        diagnostics.exports, schedule, { info: (...args) => logs.push(args) },
      );
      return diagnostics.exports;
    }
    throw new Error(`Unexpected import ${name}`);
  };
  class Clock extends Date { static now() { return clock.now; } }
  new Function('require', 'module', 'exports', '__DEV__', 'setTimeout', 'clearTimeout', 'Date', code)(
    mockRequire, module, module.exports, options.dev ?? true, schedule, cancel, Clock,
  );
  return { ads: module.exports, created, events, stats, timers, logs, clock };
}

test('refreshes UMP consent before SDK initialization or ad loading', async () => {
  const { ads, created, stats } = harness();
  await ads.prepareAds();
  await ads.prepareAds();
  assert.equal(stats.gather, 1);
  assert.equal(stats.initialized, 1);
  assert.equal(created.interstitial.length, 1);
  assert.equal(created.rewarded.length, 1);
  assert.equal(ads.isAdsReady(), true);
});

test('banner remains unavailable when AdMob initialization fails despite allowed consent', async () => {
  const { ads, created, stats } = harness({ initializeError: true });
  await ads.prepareAds();
  assert.equal(ads.canRequestAds(), true);
  assert.equal(ads.isAdsReady(), false);
  assert.equal(stats.initialized, 1);
  assert.equal(created.interstitial.length, 0);
  assert.equal(created.rewarded.length, 0);
});

test('interstitial resolves after a stalled show and retains frequency rules', async () => {
  const { ads, created, timers } = harness({ fakeTimers: true, interstitialShowNeverSettles: true });
  await ads.prepareAds();
  for (let i = 0; i < 3; i++) ads.registerCompletedPuzzle(`puzzle-${i}`);
  const pending = ads.showInterstitialAtTransition();
  const showTimers = timers.filter(timer => timer.delay === 60_000);
  assert.equal(showTimers.length, 1);
  assert.equal(showTimers[0].cancelled, false);
  showTimers[0].callback();
  await pending;
  assert.equal(showTimers[0].cancelled, true);
  assert.equal(created.interstitial[0].destroyed, true);
  await ads.prepareAds();
  for (let i = 3; i < 6; i++) ads.registerCompletedPuzzle(`puzzle-${i}`);
  await ads.showInterstitialAtTransition();
  assert.equal(timers.filter(timer => timer.delay === 60_000).length, 1); // Minimum interval still blocks another show.
});

test('interstitial close resolves promptly and cancels the fail-safe timer', async () => {
  const { ads, created, events, timers } = harness({ fakeTimers: true });
  await ads.prepareAds();
  for (let i = 0; i < 3; i++) ads.registerCompletedPuzzle(`puzzle-${i}`);
  const pending = ads.showInterstitialAtTransition();
  created.interstitial[0].emit(events.CLOSED);
  await pending;
  assert.equal(timers.find(timer => timer.delay === 60_000).cancelled, true);
  assert.equal(created.interstitial[0].destroyed, true);
});

test('denied consent prevents initialization, all ad requests, and rewarded coins', async () => {
  const { ads, created, stats } = harness({
    info: { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
  });
  await ads.prepareAds();
  assert.equal(stats.gather, 1);
  assert.equal(stats.initialized, 0);
  assert.equal(created.interstitial.length, 0);
  assert.equal(created.rewarded.length, 0);
  assert.equal(ads.canRequestAds(), false);
  assert.equal(ads.canOpenPrivacyOptions(), true);
  assert.equal(await ads.watchRewardedForCoins(async () => { throw new Error('never called'); }), 'unavailable');
});

test('a required privacy-options form can grant consent and enable ads', async () => {
  const { ads, created, stats } = harness({
    info: { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
    privacyResult: { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' },
  });
  await ads.prepareAds();
  assert.equal(await ads.showPrivacyOptions(), true);
  await ads.prepareAds();
  assert.equal(stats.privacyForms, 1);
  assert.equal(stats.initialized, 1);
  assert.equal(created.rewarded.length, 1);
  assert.equal(ads.canRequestAds(), true);
});

test('revoking consent hides loaded ads and blocks subsequent ad requests', async () => {
  const { ads, created, stats } = harness({
    info: { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' },
    privacyResult: { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
  });
  await ads.prepareAds();
  assert.equal(ads.isRewardedReady(), true);
  await ads.showPrivacyOptions();
  await ads.prepareAds();
  assert.equal(ads.canRequestAds(), false);
  assert.equal(ads.isRewardedReady(), false);
  assert.equal(created.rewarded.length, 1);
  assert.equal(stats.initialized, 1);
});

test('a consent network failure stays ad-free without cached permission', async () => {
  const { ads, created, stats } = harness({
    info: { canRequestAds: false, privacyOptionsRequirementStatus: 'UNKNOWN' },
    gatherError: true,
  });
  await ads.prepareAds();
  assert.equal(stats.cached, 1);
  assert.equal(stats.initialized, 0);
  assert.equal(created.rewarded.length, 0);
  assert.equal(ads.canRequestAds(), false);
});

test('a consent network failure only uses SDK-confirmed cached permission', async () => {
  const { ads, stats } = harness({ gatherError: true });
  await ads.prepareAds();
  assert.equal(stats.cached, 1);
  assert.equal(stats.initialized, 1);
});

test('missing consent state never crashes or loads ads', async () => {
  const { ads, created, stats } = harness({ gatherError: true, cachedError: true });
  await ads.prepareAds();
  assert.equal(stats.initialized, 0);
  assert.equal(created.interstitial.length, 0);
});

test('reward is granted only after the earned callback, once per ad', async () => {
  const { ads, created, events } = harness();
  await ads.prepareAds();
  let coins = 0;
  const pending = ads.watchRewardedForCoins(async (amount) => { coins += amount; });
  const ad = created.rewarded[0];
  assert.equal(coins, 0);
  ad.emit(events.EARNED_REWARD);
  ad.emit(events.EARNED_REWARD);
  ad.emit(events.CLOSED);
  assert.equal(await pending, 'earned');
  assert.equal(coins, 50);
});

test('closing without earning does not grant coins', async () => {
  const { ads, created, events } = harness();
  await ads.prepareAds();
  let coins = 0;
  const pending = ads.watchRewardedForCoins(async (amount) => { coins += amount; });
  created.rewarded[0].emit(events.CLOSED);
  assert.equal(await pending, 'closed');
  assert.equal(coins, 0);
});

test('a failed coin save does not claim a successful reward', async () => {
  const { ads, created, events } = harness();
  await ads.prepareAds();
  const pending = ads.watchRewardedForCoins(async () => { throw new Error('storage failed'); });
  created.rewarded[0].emit(events.EARNED_REWARD);
  created.rewarded[0].emit(events.CLOSED);
  assert.equal(await pending, 'save-failed');
});

function benefits() {
  const source = fs.readFileSync(path.resolve(__dirname, '../services/rewardedBenefits.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  new Function('exports', compiled)(exports);
  return exports;
}

test('Home grants exactly 100 persisted coins only after earned, ignoring duplicate taps and callbacks', async () => {
  const { ads, created, events } = harness();
  await ads.prepareAds();
  let coins = 0, saves = 0;
  const grant = benefits().createCoinReward(async amount => { coins += amount; saves++; });
  const pending = ads.watchRewarded(grant, 'home-coins');
  assert.equal(await ads.watchRewarded(grant, 'home-coins'), 'unavailable');
  assert.equal(coins, 0);
  assert.equal(created.rewarded[0].showCalls, 1);
  created.rewarded[0].emit(events.EARNED_REWARD);
  created.rewarded[0].emit(events.EARNED_REWARD);
  created.rewarded[0].emit(events.CLOSED);
  assert.equal(await pending, 'earned');
  await grant();
  assert.equal(coins, 100);
  assert.equal(saves, 1);
  assert.equal(created.rewarded.length, 2, 'a new ad is prepared after dismissal');
});

test('hint benefit adds exactly three through existing state without consuming a free hint', async () => {
  const { ads, created, events } = harness();
  await ads.prepareAds();
  let hints = 3;
  const grant = benefits().createHintReward('active-puzzle', () => 'active-puzzle', amount => { hints += amount; });
  const pending = ads.watchRewarded(grant, 'puzzle-hints');
  assert.equal(hints, 3);
  created.rewarded[0].emit(events.EARNED_REWARD);
  created.rewarded[0].emit(events.EARNED_REWARD);
  created.rewarded[0].emit(events.CLOSED);
  assert.equal(await pending, 'earned');
  grant();
  assert.equal(hints, 6);
});

for (const startingHints of [0, 3]) {
  test(`earned hint rewards accumulate from ${startingHints} without overwriting or consuming the balance`, async () => {
    const { ads, created, events } = harness();
    let hints = startingHints;
    const balances = [];
    for (let i = 0; i < 3; i++) {
      await ads.prepareAds();
      const grant = benefits().createHintReward('same-puzzle', () => 'same-puzzle', amount => {
        hints += amount;
      });
      const pending = ads.watchRewarded(grant, 'puzzle-hints');
      const ad = created.rewarded[i];
      assert.equal(hints, startingHints + i * 3, 'opening an ad must not change the balance');
      ad.emit(events.EARNED_REWARD);
      ad.emit(events.EARNED_REWARD);
      ad.emit(events.CLOSED);
      assert.equal(await pending, 'earned');
      assert.equal(grant(), false, 'the same earned benefit cannot be reused');
      balances.push(hints);
    }
    assert.deepEqual(balances, [startingHints + 3, startingHints + 6, startingHints + 9]);
  });
}

test('one earned ad grants only its selected benefit, never both coins and hints', async () => {
  const { ads, created, events } = harness();
  let coins = 50, hints = 3;
  await ads.prepareAds();
  const home = ads.watchRewarded(benefits().createCoinReward(async amount => { coins += amount; }), 'home-coins');
  created.rewarded[0].emit(events.EARNED_REWARD);
  created.rewarded[0].emit(events.EARNED_REWARD);
  created.rewarded[0].emit(events.CLOSED);
  assert.equal(await home, 'earned');
  assert.deepEqual({ coins, hints }, { coins: 150, hints: 3 });
  await ads.prepareAds();
  const puzzle = ads.watchRewarded(benefits().createHintReward('puzzle', () => 'puzzle', amount => { hints += amount; }), 'puzzle-hints');
  created.rewarded[1].emit(events.EARNED_REWARD);
  created.rewarded[1].emit(events.EARNED_REWARD);
  created.rewarded[1].emit(events.CLOSED);
  assert.equal(await puzzle, 'earned');
  assert.deepEqual({ coins, hints }, { coins: 150, hints: 6 });
});

for (const nextPuzzle of [null, 'different-puzzle']) {
  test(`a delayed hint reward does not reach a blurred, completed or different puzzle (${nextPuzzle})`, async () => {
    const { ads, created, events } = harness();
    await ads.prepareAds();
    let hints = 0, active = 'original-puzzle';
    const grant = benefits().createHintReward('original-puzzle', () => active, amount => { hints += amount; });
    const pending = ads.watchRewarded(grant, 'puzzle-hints');
    active = nextPuzzle;
    created.rewarded[0].emit(events.EARNED_REWARD);
    created.rewarded[0].emit(events.CLOSED);
    assert.equal(await pending, 'cancelled');
    assert.equal(hints, 0);
  });
}

for (const placement of ['home-coins', 'puzzle-hints']) {
  test(`${placement} grants nothing when closed without earned or when late earned follows dismissal`, async () => {
    const { ads, created, events } = harness();
    await ads.prepareAds();
    let granted = 0;
    const pending = ads.watchRewarded(() => { granted++; }, placement);
    const ad = created.rewarded[0];
    ad.emit(events.CLOSED);
    ad.emit(events.EARNED_REWARD);
    assert.equal(await pending, 'closed');
    assert.equal(granted, 0);
  });
}

for (const option of ['showThrows', 'showRejects']) {
  test(`rewarded ${option} grants no benefit and reloads`, async () => {
    const { ads, created } = harness({ [option]: 'rewarded' });
    await ads.prepareAds();
    let granted = 0;
    assert.equal(await ads.watchRewarded(() => { granted++; }, 'home-coins'), 'unavailable');
    assert.equal(granted, 0);
    await Promise.resolve();
    assert.equal(created.rewarded[0].destroyed, true);
    assert.equal(created.rewarded.length, 2);
  });
}

test('an unavailable/loading rewarded ad grants nothing and cannot be presented', async () => {
  const { ads, created } = harness({ autoLoad: false, fakeTimers: true });
  await ads.prepareAds();
  assert.equal(ads.isRewardedLoading(), true);
  let granted = 0;
  assert.equal(await ads.watchRewarded(() => { granted++; }, 'puzzle-hints'), 'unavailable');
  assert.equal(created.rewarded[0].showCalls, 0);
  assert.equal(granted, 0);
});

test('rewarded load failure cannot grant a reward and schedules a retry', async () => {
  const { ads, created, events, timers } = harness({ fakeTimers: true });
  await ads.prepareAds();
  created.rewarded[0].emit(events.ERROR, { code: 'no-fill' });
  let granted = 0;
  assert.equal(await ads.watchRewarded(() => { granted++; }, 'home-coins'), 'unavailable');
  assert.equal(granted, 0);
  assert.equal(created.rewarded[0].showCalls, 0);
  assert.ok(timers.some(timer => timer.delay === 2000 && !timer.cancelled));
});

test('a rewarded presentation timeout releases its guard without granting a reward', async () => {
  const { ads, created, timers } = harness({ fakeTimers: true });
  await ads.prepareAds();
  let granted = 0;
  const pending = ads.watchRewarded(() => { granted++; }, 'home-coins');
  timers.find(timer => timer.delay === 120_000).callback();
  assert.equal(await pending, 'unavailable');
  assert.equal(granted, 0);
  assert.equal(created.rewarded[0].destroyed, true);
  assert.equal(ads.isRewardedReady(), true);
});

test('failed initialization can succeed on a later preparation instead of caching failure forever', async () => {
  const { ads, stats, created, logs } = harness({ initializeFailures: 1 });
  await ads.prepareAds();
  assert.equal(created.interstitial.length, 0);
  await ads.prepareAds();
  assert.equal(stats.initialized, 2);
  assert.equal(created.interstitial.length, 1);
  assert.ok(logs.some(([, event]) => event === 'initialize-error'));
  assert.ok(logs.some(([, event]) => event === 'initialize-success'));
});

test('interstitial registration counts distinct nonempty puzzle IDs only and retains three-completion threshold', async () => {
  const { ads, created, logs } = harness();
  await ads.prepareAds();
  ads.registerCompletedPuzzle('');
  ads.registerCompletedPuzzle('one');
  ads.registerCompletedPuzzle('one');
  ads.registerCompletedPuzzle('two');
  await ads.showInterstitialAtTransition();
  assert.equal(created.interstitial[0].showCalls, 0);
  assert.equal(logs.filter(([, event]) => event === 'completion-registered').length, 2);
  assert.ok(logs.some(([, event, fields]) => event === 'interstitial-skipped' && fields.reason === 'completion-threshold'));
});

test('a loading interstitial can become ready during the bounded Results transition wait', async () => {
  const { ads, created, events, logs } = harness({ autoLoad: false, fakeTimers: true });
  await ads.prepareAds();
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  const pending = ads.showInterstitialAtTransition();
  const ad = created.interstitial[0];
  assert.equal(ad.showCalls, 0);
  ad.emit(events.LOADED);
  await Promise.resolve();
  assert.equal(ad.showCalls, 1);
  ad.emit(events.OPENED);
  ad.emit(events.IMPRESSION);
  ad.emit(events.CLOSED);
  await pending;
  assert.ok(logs.some(([, event]) => event === 'impression'));
  assert.ok(logs.some(([, event]) => event === 'transition-complete'));
});

test('an interstitial that never loads releases Results navigation after 1800ms without a later surprise show', async () => {
  const { ads, created, events, timers, logs } = harness({ autoLoad: false, fakeTimers: true });
  await ads.prepareAds();
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  const pending = ads.showInterstitialAtTransition();
  timers.find(timer => timer.delay === 1800).callback();
  await pending;
  created.interstitial[0].emit(events.LOADED);
  assert.equal(created.interstitial[0].showCalls, 0);
  assert.ok(logs.some(([, event, fields]) => event === 'interstitial-skipped' && fields.reason === 'not-loaded'));
});

test('cancelling the load wait releases promptly and late loading cannot show an ad', async () => {
  const { ads, created, events, timers } = harness({ autoLoad: false, fakeTimers: true });
  await ads.prepareAds();
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  const controller = new AbortController();
  const pending = ads.showInterstitialAtTransition({ signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.status, 'cancelled');
  assert.equal(result.displayed, false);
  assert.equal(timers.find(timer => timer.delay === 1800).cancelled, true);
  created.interstitial[0].emit(events.LOADED);
  await Promise.resolve();
  assert.equal(created.interstitial[0].showCalls, 0);
  // Cancellation did not consume eligibility or leave the transition locked.
  const next = ads.showInterstitialAtTransition();
  assert.equal(created.interstitial[0].showCalls, 1);
  created.interstitial[0].emit(events.CLOSED);
  assert.equal((await next).status, 'closed');
});

test('inactive transitions cannot present before loading or after the load wait', async () => {
  const { ads, created, events } = harness({ autoLoad: false });
  await ads.prepareAds();
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  let active = false;
  assert.equal((await ads.showInterstitialAtTransition({ canPresent: () => active })).status, 'cancelled');
  active = true;
  const pending = ads.showInterstitialAtTransition({ canPresent: () => active });
  active = false;
  created.interstitial[0].emit(events.LOADED);
  assert.equal((await pending).status, 'cancelled');
  assert.equal(created.interstitial[0].showCalls, 0);
});

test('final active-screen check runs immediately before native show', async () => {
  const { ads, created } = harness();
  await ads.prepareAds();
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  let checks = 0;
  const result = await ads.showInterstitialAtTransition({ canPresent: () => ++checks < 3 });
  assert.equal(checks, 3);
  assert.equal(result.status, 'cancelled');
  assert.equal(created.interstitial[0].showCalls, 0);
  assert.equal(created.interstitial[0].destroyed, true);
});

test('accepted requests are not reported as displayed; opened and impression are separate evidence', async () => {
  for (const evidence of ['none', 'opened', 'impression']) {
    const { ads, created, events } = harness();
    await ads.prepareAds();
    for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
    const controller = new AbortController();
    const pending = ads.showInterstitialAtTransition({ signal: controller.signal });
    await Promise.resolve(); // Native show request resolves, without proving display.
    if (evidence !== 'none') created.interstitial[0].emit(events[evidence.toUpperCase()]);
    controller.abort(); // A native show already in progress must retain its close guard.
    created.interstitial[0].emit(events.CLOSED);
    created.interstitial[0].emit(events.CLOSED);
    assert.deepEqual(await pending, {
      status: 'closed', reason: 'dismissed', displayed: evidence !== 'none', impression: evidence === 'impression',
    });
  }
});

test('interstitial outcomes distinguish eligibility skips, show errors, and stalled shows', async () => {
  const skipped = harness();
  await skipped.ads.prepareAds();
  assert.equal((await skipped.ads.showInterstitialAtTransition()).reason, 'completion-threshold');
  for (const options of [{ showThrows: 'interstitial' }, { showRejects: 'interstitial' }, { interstitialShowNeverSettles: true }]) {
    const { ads, timers } = harness({ ...options, fakeTimers: true });
    await ads.prepareAds();
    for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
    const pending = ads.showInterstitialAtTransition();
    if (options.interstitialShowNeverSettles) timers.find(timer => timer.delay === 60000).callback();
    const result = await pending;
    assert.equal(result.status, options.interstitialShowNeverSettles ? 'timed-out' : 'failed');
    assert.equal(result.displayed, false);
    assert.equal(result.impression, false);
  }
});

test('competing interstitial requests are skipped and reused puzzle IDs never count again after a show', async () => {
  const { ads, created, events, clock } = harness();
  await ads.prepareAds();
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  const first = ads.showInterstitialAtTransition();
  assert.equal((await ads.showInterstitialAtTransition()).reason, 'presentation-in-progress');
  created.interstitial[0].emit(events.OPENED);
  created.interstitial[0].emit(events.CLOSED);
  await first;
  clock.now += 120001;
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  assert.equal((await ads.showInterstitialAtTransition()).reason, 'completion-threshold');
});

test('load failure schedules a bounded retry and does not present an ad outside a transition', async () => {
  const { ads, created, events, timers } = harness({ fakeTimers: true });
  await ads.prepareAds();
  created.interstitial[0].emit(events.ERROR, { code: 'no-fill' });
  assert.equal(created.interstitial[0].destroyed, true);
  assert.equal(created.interstitial.length, 1);
  timers.find(timer => timer.delay === 2000 && !timer.cancelled).callback();
  await ads.prepareAds();
  assert.equal(created.interstitial.length, 2);
  assert.equal(created.interstitial[1].showCalls, 0);
});

test('loading timeout frees a stuck ad object and schedules retry rather than remaining permanently not ready', async () => {
  const { ads, created, timers } = harness({ autoLoad: false, fakeTimers: true });
  await ads.prepareAds();
  timers.find(timer => timer.delay === 15_000 && !timer.cancelled).callback();
  assert.equal(created.interstitial[0].destroyed, true);
  assert.ok(timers.some(timer => timer.delay === 2000));
  timers.find(timer => timer.delay === 2000).callback();
  await ads.prepareAds();
  assert.equal(created.interstitial.length, 2);
});

test('privacy revocation cancels pending retry and cannot request or present new ads', async () => {
  const { ads, created, events, timers } = harness({
    fakeTimers: true,
    info: { canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' },
    privacyResult: { canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' },
  });
  await ads.prepareAds();
  created.interstitial[0].emit(events.ERROR);
  const retry = timers.find(timer => timer.delay === 2000);
  await ads.showPrivacyOptions();
  assert.equal(retry.cancelled, true);
  retry.callback(); // Even an already-queued callback must recheck consent.
  await ads.prepareAds();
  assert.equal(created.interstitial.length, 1);
  assert.equal(ads.canRequestAds(), false);
});

for (const option of ['showThrows', 'showRejects']) {
  test(`interstitial ${option} releases navigation, logs the error, and prepares another ad`, async () => {
    const { ads, created, logs } = harness({ [option]: 'interstitial' });
    await ads.prepareAds();
    for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
    await ads.showInterstitialAtTransition();
    await Promise.resolve();
    assert.equal(created.interstitial[0].destroyed, true);
    assert.equal(created.interstitial.length, 2);
    assert.ok(logs.some(([, event]) => event === 'show-error'));
  });
}

test('interstitial and rewarded presentations cannot overlap', async () => {
  const { ads, created, events, logs } = harness();
  await ads.prepareAds();
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  const pending = ads.watchRewarded(() => {}, 'home-coins');
  await ads.showInterstitialAtTransition();
  assert.equal(created.interstitial[0].showCalls, 0);
  assert.ok(logs.some(([, event, fields]) => event === 'interstitial-skipped' && fields.reason === 'presentation-in-progress'));
  created.rewarded[0].emit(events.CLOSED);
  await pending;
});

test('dismissal reloads but neither fewer than three new completions nor the two-minute cooldown is bypassed', async () => {
  const { ads, created, events, clock } = harness();
  await ads.prepareAds();
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  const pending = ads.showInterstitialAtTransition();
  created.interstitial[0].emit(events.OPENED);
  created.interstitial[0].emit(events.CLOSED);
  await pending;
  await ads.prepareAds();
  clock.now += 120_001;
  ads.registerCompletedPuzzle('four');
  await ads.showInterstitialAtTransition();
  assert.equal(created.interstitial[1].showCalls, 0);
  ads.registerCompletedPuzzle('five');
  ads.registerCompletedPuzzle('six');
  const next = ads.showInterstitialAtTransition();
  assert.equal(created.interstitial[1].showCalls, 1);
  created.interstitial[1].emit(events.CLOSED);
  await next;
});

test('expired cached rewarded ads are not shown and are replaced during preparation', async () => {
  const { ads, created, clock } = harness();
  await ads.prepareAds();
  clock.now += 46 * 60_000;
  assert.equal(ads.isRewardedReady(), false);
  await ads.prepareAds();
  assert.equal(created.rewarded[0].destroyed, true);
  assert.equal(created.rewarded.length, 2);
  assert.equal(ads.isRewardedReady(), true);
});

test('cleanup errors cannot strand interstitial navigation', async () => {
  const { ads, created, events } = harness({ cleanupThrows: true });
  await ads.prepareAds();
  for (const id of ['one', 'two', 'three']) ads.registerCompletedPuzzle(id);
  const pending = ads.showInterstitialAtTransition();
  created.interstitial[0].emit(events.CLOSED);
  await pending;
  assert.equal(created.interstitial[0].destroyed, true);
});

test('diagnostics distinguish failures and skips without logging raw errors or puzzle IDs', async () => {
  const { ads, created, events, logs } = harness({ fakeTimers: true });
  await ads.prepareAds();
  ads.registerCompletedPuzzle('private-puzzle-id');
  await ads.showInterstitialAtTransition();
  created.interstitial[0].emit(events.ERROR, { code: 'no-fill', message: 'private-native-payload' });
  const text = JSON.stringify(logs);
  assert.ok(text.includes('no-fill'));
  assert.ok(text.includes('completion-threshold'));
  assert.ok(!text.includes('private-puzzle-id'));
  assert.ok(!text.includes('private-native-payload'));
});

test('development requests test ad units and release requests the existing configured units', async () => {
  for (const dev of [true, false]) {
    const { ads, created } = harness({ dev });
    await ads.prepareAds();
    assert.equal(created.interstitial[0].unitId, dev ? 'test-interstitial' : 'live-interstitial');
    assert.equal(created.rewarded[0].unitId, dev ? 'test-rewarded' : 'live-rewarded');
  }
});