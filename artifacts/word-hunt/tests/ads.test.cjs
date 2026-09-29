const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness(options = {}) {
  const created = { rewarded: [], interstitial: [] };
  const events = { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error', EARNED_REWARD: 'earned' };
  const stats = { gather: 0, cached: 0, initialized: 0, privacyForms: 0 };
  const info = options.info ?? { canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' };
  function makeAd(kind) {
    const callbacks = new Map();
    const ad = {
      loaded: false,
      addAdEventListener(event, callback) {
        if (!callbacks.has(event)) callbacks.set(event, new Set());
        callbacks.get(event).add(callback);
        return () => callbacks.get(event).delete(callback);
      },
      emit(event) { for (const callback of [...(callbacks.get(event) ?? [])]) callback(); },
      load() { this.loaded = true; this.emit(events.LOADED); },
      show: async () => {},
      destroy() {},
    };
    created[kind].push(ad);
    return ad;
  }
  const sdk = {
    default: () => ({ initialize: async () => { stats.initialized++; return []; } }),
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
    InterstitialAd: { createForAdRequest: () => makeAd('interstitial') },
    RewardedAd: { createForAdRequest: () => makeAd('rewarded') },
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
    throw new Error(`Unexpected import ${name}`);
  };
  new Function('require', 'module', 'exports', '__DEV__', code)(mockRequire, module, module.exports, true);
  return { ads: module.exports, created, events, stats };
}

test('refreshes UMP consent before SDK initialization or ad loading', async () => {
  const { ads, created, stats } = harness();
  await ads.prepareAds();
  await ads.prepareAds();
  assert.equal(stats.gather, 1);
  assert.equal(stats.initialized, 1);
  assert.equal(created.interstitial.length, 1);
  assert.equal(created.rewarded.length, 1);
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