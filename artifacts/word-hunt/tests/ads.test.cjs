const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness() {
  const created = { rewarded: [], interstitial: [] };
  const events = { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error', EARNED_REWARD: 'earned' };
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
    default: () => ({ initialize: async () => [] }),
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
  return { ads: module.exports, created, events };
}

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