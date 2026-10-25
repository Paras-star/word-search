import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import {
  ANDROID_AD_UNITS, INTERSTITIAL_EVERY_PUZZLES, MIN_INTERSTITIAL_INTERVAL_MS, REWARDED_COINS,
} from './adConfig';
import { adErrorCode, adTimer, logAd } from './adDiagnostics';

type AdsSdk = typeof import('react-native-google-mobile-ads');
type Interstitial = ReturnType<AdsSdk['InterstitialAd']['createForAdRequest']>;
type Rewarded = ReturnType<AdsSdk['RewardedAd']['createForAdRequest']>;
type ConsentInfo = Awaited<ReturnType<AdsSdk['AdsConsent']['getConsentInfo']>>;
export type WatchResult = 'earned' | 'closed' | 'unavailable' | 'save-failed' | 'cancelled';
export type RewardPlacement = 'home-coins' | 'puzzle-hints' | 'results-coins';

let sdk: AdsSdk | null | undefined;
function getSdk(): AdsSdk | null {
  // Expo Go has no native AdMob module. iOS needs a production app/unit ID before ads can run.
  if (Platform.OS !== 'android' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  if (sdk !== undefined) return sdk;
  try {
    sdk = require('react-native-google-mobile-ads') as AdsSdk;
  } catch (error) {
    sdk = null;
    logAd('sdk-unavailable', { code: adErrorCode(error) });
  }
  return sdk;
}

export const isAdsSupported = () => getSdk() !== null;
let consentAllowed = false;
let privacyOptionsRequired = false;
let privacyOpen = false;
let consentPromise: Promise<boolean> | null = null;
export const canRequestAds = () => consentAllowed && !privacyOpen && isAdsSupported();
export const canOpenPrivacyOptions = () => privacyOptionsRequired && !privacyOpen && isAdsSupported();

function unitId(kind: keyof typeof ANDROID_AD_UNITS, ads: AdsSdk): string {
  return __DEV__ ? ads.TestIds[kind.toUpperCase() as 'BANNER' | 'INTERSTITIAL' | 'REWARDED'] : ANDROID_AD_UNITS[kind];
}

const listeners = new Set<() => void>();
function notify() { listeners.forEach((listener) => listener()); }
export function subscribeToAds(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let initialized: Promise<AdsSdk | null> | null = null;
let adsReady = false;
export const isAdsReady = () => adsReady && canRequestAds();
let interstitial: Interstitial | null = null;
let rewarded: Rewarded | null = null;
let interstitialReady = false;
let rewardedReady = false;
let watching = false;
let completedCount = 0;
let lastInterstitialAt = 0;
const seenPuzzles = new Set<string>();
let transitionPending = false;
let presentingInterstitial = false;
let interstitialLoadedAt = 0;
let rewardedLoadedAt = 0;
type AdKind = 'interstitial' | 'rewarded';
const loadTimers: Partial<Record<AdKind, ReturnType<typeof setTimeout>>> = {};
const retryTimers: Partial<Record<AdKind, ReturnType<typeof setTimeout>>> = {};
const retryCounts = { interstitial: 0, rewarded: 0 };
const loadCleanup: Partial<Record<AdKind, () => void>> = {};
const LOAD_TIMEOUT_MS = 15_000;
const MAX_AD_AGE_MS = 45 * 60_000;
const TRANSITION_LOAD_WAIT_MS = 1800;

function destroyAd(ad: Interstitial | Rewarded) {
  try { ad.destroy(); } catch (error) { logAd('cleanup-error', { code: adErrorCode(error) }); }
}

function removeListeners(removers: (() => void)[]) {
  for (const remove of removers) {
    try { remove(); } catch (error) { logAd('cleanup-error', { code: adErrorCode(error) }); }
  }
}

function clearPrepared(kind: AdKind) {
  clearTimeout(loadTimers[kind]);
  delete loadTimers[kind];
  loadCleanup[kind]?.();
  delete loadCleanup[kind];
  const ad = kind === 'interstitial' ? interstitial : rewarded;
  if (kind === 'interstitial') { interstitial = null; interstitialReady = false; }
  else { rewarded = null; rewardedReady = false; }
  if (ad) destroyAd(ad);
  notify();
}

function retryLoad(kind: AdKind) {
  if (retryTimers[kind] || !canRequestAds()) return;
  const delay = Math.min(2000 * 2 ** Math.min(retryCounts[kind]++, 4), 30_000);
  logAd('reload-scheduled', { kind, delayMs: delay });
  retryTimers[kind] = adTimer(() => {
    delete retryTimers[kind];
    void prepareAds();
  }, delay);
}

function discardLoadedAds() {
  for (const kind of ['interstitial', 'rewarded'] as const) {
    clearTimeout(retryTimers[kind]);
    delete retryTimers[kind];
    clearPrepared(kind);
  }
}

function applyConsentInfo(ads: AdsSdk, info: ConsentInfo | null) {
  consentAllowed = info?.canRequestAds === true;
  privacyOptionsRequired = info?.privacyOptionsRequirementStatus === ads.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  logAd('consent-result', { allowed: consentAllowed, privacyOptionsRequired, privacyOpen });
  if (!consentAllowed) discardLoadedAds();
  else notify();
  return consentAllowed;
}

function refreshConsent(ads: AdsSdk): Promise<boolean> {
  if (!consentPromise) {
    // gatherConsent refreshes UMP information and displays a required form.
    // On a network error, only the SDK's cached canRequestAds result may allow ads.
    consentPromise = (async () => {
      try {
        logAd('consent-refresh');
        return applyConsentInfo(ads, await ads.AdsConsent.gatherConsent());
      } catch (error) {
        logAd('consent-refresh-error', { code: adErrorCode(error) });
        try {
          const info = await ads.AdsConsent.getConsentInfo();
          const allowed = applyConsentInfo(ads, info);
          if (!allowed) consentPromise = null; // Retry on a later screen visit.
          return allowed;
        } catch {
          applyConsentInfo(ads, null);
          consentPromise = null;
          return false;
        }
      }
    })();
  }
  return consentPromise;
}

export async function showPrivacyOptions(): Promise<boolean> {
  const ads = getSdk();
  if (!ads || !canOpenPrivacyOptions()) return false;
  privacyOpen = true;
  logAd('privacy-options-opened');
  discardLoadedAds(); // Hide banners and pause ad requests while choices are open.
  let shown = false;
  try {
    applyConsentInfo(ads, await ads.AdsConsent.showPrivacyOptionsForm());
    shown = true;
  } catch {
    try {
      applyConsentInfo(ads, await ads.AdsConsent.getConsentInfo());
    } catch {
      applyConsentInfo(ads, null);
    }
  } finally {
    privacyOpen = false;
    logAd('privacy-options-closed', { allowed: consentAllowed });
    consentPromise = Promise.resolve(consentAllowed);
    notify();
    if (consentAllowed) void prepareAds();
  }
  return shown;
}

function loadInterstitial(ads: AdsSdk) {
  if (interstitial || !canRequestAds()) return;
  try {
    const ad = ads.InterstitialAd.createForAdRequest(unitId('interstitial', ads));
    interstitial = ad;
    const loaded = ad.addAdEventListener(ads.AdEventType.LOADED, () => {
      if (interstitial !== ad) return;
      clearTimeout(loadTimers.interstitial);
      interstitialReady = true;
      interstitialLoadedAt = Date.now();
      retryCounts.interstitial = 0;
      logAd('loaded', { kind: 'interstitial' });
      notify();
    });
    const error = ad.addAdEventListener(ads.AdEventType.ERROR, (failure) => {
      logAd('load-error', { kind: 'interstitial', code: adErrorCode(failure) });
      if (interstitial === ad) { clearPrepared('interstitial'); retryLoad('interstitial'); }
    });
    loadCleanup.interstitial = () => removeListeners([loaded, error]);
    loadTimers.interstitial = adTimer(() => {
      if (interstitial !== ad || interstitialReady) return;
      logAd('load-timeout', { kind: 'interstitial' });
      clearPrepared('interstitial');
      retryLoad('interstitial');
    }, LOAD_TIMEOUT_MS);
    logAd('load-request', { kind: 'interstitial', testAds: __DEV__ });
    notify();
    ad.load();
  } catch (error) {
    logAd('load-error', { kind: 'interstitial', code: adErrorCode(error) });
    clearPrepared('interstitial');
    retryLoad('interstitial');
  }
}

function loadRewarded(ads: AdsSdk) {
  if (rewarded || !canRequestAds()) return;
  try {
    const ad = ads.RewardedAd.createForAdRequest(unitId('rewarded', ads));
    rewarded = ad;
    const loaded = ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
      if (rewarded !== ad) return;
      clearTimeout(loadTimers.rewarded);
      rewardedReady = true;
      rewardedLoadedAt = Date.now();
      retryCounts.rewarded = 0;
      logAd('loaded', { kind: 'rewarded' });
      notify();
    });
    const error = ad.addAdEventListener(ads.AdEventType.ERROR, (failure) => {
      logAd('load-error', { kind: 'rewarded', code: adErrorCode(failure) });
      if (rewarded === ad) { clearPrepared('rewarded'); retryLoad('rewarded'); }
    });
    loadCleanup.rewarded = () => removeListeners([loaded, error]);
    loadTimers.rewarded = adTimer(() => {
      if (rewarded !== ad || rewardedReady) return;
      logAd('load-timeout', { kind: 'rewarded' });
      clearPrepared('rewarded');
      retryLoad('rewarded');
    }, LOAD_TIMEOUT_MS);
    logAd('load-request', { kind: 'rewarded', testAds: __DEV__ });
    notify();
    ad.load();
  } catch (error) {
    logAd('load-error', { kind: 'rewarded', code: adErrorCode(error) });
    clearPrepared('rewarded');
    retryLoad('rewarded');
  }
}

export async function prepareAds() {
  const ads = getSdk();
  if (!ads) return;
  if (!await refreshConsent(ads) || !canRequestAds()) return;
  if (!initialized) {
    logAd('initialize-start');
    try {
      initialized = ads.default().initialize().then(() => {
        logAd('initialize-success');
        return ads;
      }).catch((error: unknown) => {
        initialized = null; // A transient startup failure must be retryable.
        logAd('initialize-error', { code: adErrorCode(error) });
        return null;
      });
    } catch (error) {
      logAd('initialize-error', { code: adErrorCode(error) });
      return;
    }
  }
  const ready = await initialized;
  if (!ready || !canRequestAds()) return;
  if (!adsReady) {
    adsReady = true;
    notify();
  }
  if (interstitialReady && Date.now() - interstitialLoadedAt >= MAX_AD_AGE_MS) clearPrepared('interstitial');
  if (rewardedReady && Date.now() - rewardedLoadedAt >= MAX_AD_AGE_MS) clearPrepared('rewarded');
  if (!retryTimers.interstitial) loadInterstitial(ready);
  if (!retryTimers.rewarded) loadRewarded(ready);
}

export function registerCompletedPuzzle(puzzleId: string) {
  if (!puzzleId || seenPuzzles.has(puzzleId)) {
    logAd('completion-ignored', { completedCount });
    return;
  }
  seenPuzzles.add(puzzleId);
  completedCount += 1;
  logAd('completion-registered', { completedCount });
}

function waitForInterstitial() {
  return new Promise<void>((resolve) => {
    const finish = () => { clearTimeout(timeout); unsubscribe(); resolve(); };
    const unsubscribe = subscribeToAds(() => {
      if (interstitialReady || !canRequestAds()) finish();
    });
    const timeout = adTimer(finish, TRANSITION_LOAD_WAIT_MS);
    void prepareAds();
  });
}

export async function showInterstitialAtTransition() {
  const ads = getSdk();
  const skip = (reason: string) => logAd('interstitial-skipped', {
    reason, completedCount, ready: interstitialReady, hasAd: interstitial !== null,
    consentAllowed, privacyOpen,
  });
  if (!ads) { skip('sdk-unavailable'); return; }
  if (!canRequestAds()) { skip(privacyOpen ? 'privacy-open' : 'consent-not-allowed'); return; }
  if (transitionPending || presentingInterstitial || watching) { skip('presentation-in-progress'); return; }
  if (completedCount < INTERSTITIAL_EVERY_PUZZLES) { skip('completion-threshold'); return; }
  if (Date.now() - lastInterstitialAt < MIN_INTERSTITIAL_INTERVAL_MS) { skip('minimum-interval'); return; }
  transitionPending = true;
  try {
    if (interstitialReady && Date.now() - interstitialLoadedAt >= MAX_AD_AGE_MS) clearPrepared('interstitial');
    if (!interstitial || !interstitialReady) {
      logAd('interstitial-waiting-for-load', { maxWaitMs: TRANSITION_LOAD_WAIT_MS });
      await waitForInterstitial();
    }
    if (!canRequestAds()) { skip('consent-changed'); return; }
    if (!interstitial || !interstitialReady) { skip('not-loaded'); return; }
    const ad = interstitial;
    loadCleanup.interstitial?.();
    delete loadCleanup.interstitial;
    interstitial = null;
    interstitialReady = false;
    presentingInterstitial = true;
    logAd('show-attempt', { kind: 'interstitial', completedCount });
    await new Promise<void>((resolve) => {
      let settled = false;
      let recorded = false;
      const removers: (() => void)[] = [];
      const recordAttempt = () => {
        if (recorded) return;
        recorded = true;
        completedCount = 0;
        lastInterstitialAt = Date.now();
      };
      const finish = (reason: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        removeListeners(removers);
        destroyAd(ad);
        presentingInterstitial = false;
        logAd('transition-complete', { reason, navigationAllowed: true });
        resolve();
        void prepareAds();
      };
      removers.push(ad.addAdEventListener(ads.AdEventType.CLOSED, () => finish('dismissed')));
      removers.push(ad.addAdEventListener(ads.AdEventType.ERROR, (error) => {
        logAd('show-error', { kind: 'interstitial', code: adErrorCode(error) });
        finish('show-error');
      }));
      removers.push(ad.addAdEventListener(ads.AdEventType.OPENED, () => {
        recordAttempt();
        logAd('opened', { kind: 'interstitial' });
      }));
      removers.push(ad.addAdEventListener(ads.AdEventType.IMPRESSION, () => logAd('impression', { kind: 'interstitial' })));
      const timeout = adTimer(() => {
        recordAttempt(); // Preserve the existing protection after an unconfirmed show.
        finish('timeout');
      }, 60_000);
      try {
        void ad.show().then(() => {
          if (settled) return;
          recordAttempt();
          logAd('show-request-accepted', { kind: 'interstitial' });
        }).catch((error: unknown) => {
          logAd('show-error', { kind: 'interstitial', code: adErrorCode(error) });
          finish('show-error');
        });
      } catch (error) {
        logAd('show-error', { kind: 'interstitial', code: adErrorCode(error) });
        finish('show-error');
      }
    });
  } finally {
    transitionPending = false;
  }
}

export const isRewardedReady = () => canRequestAds() && rewardedReady && !watching
  && !presentingInterstitial && !transitionPending && rewarded !== null
  && Date.now() - rewardedLoadedAt < MAX_AD_AGE_MS;
export const isRewardedLoading = () => canRequestAds() && rewarded !== null && !rewardedReady && !watching;

export async function watchRewarded(
  onEarned: () => void | boolean | Promise<void | boolean>,
  placement: RewardPlacement = 'results-coins',
): Promise<WatchResult> {
  const ads = getSdk();
  if (!ads || !isRewardedReady() || !rewarded) {
    logAd('rewarded-unavailable', { placement, ready: rewardedReady, watching });
    void prepareAds();
    return 'unavailable';
  }
  const ad = rewarded;
  loadCleanup.rewarded?.();
  delete loadCleanup.rewarded;
  rewarded = null;
  rewardedReady = false;
  watching = true;
  notify();
  logAd('show-attempt', { kind: 'rewarded', placement });
  return new Promise<WatchResult>((resolve) => {
    let earned = false;
    let done = false;
    let save: Promise<WatchResult> | null = null;
    const removers: (() => void)[] = [];
    const finish = async (reason: string) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      removeListeners(removers);
      destroyAd(ad);
      logAd('rewarded-dismissed', { reason, earned, placement });
      // Keep the presentation guard until the earned benefit has been saved.
      const result = earned && save ? await save : reason === 'dismissed' ? 'closed' : 'unavailable';
      watching = false;
      notify();
      void prepareAds();
      resolve(result);
    };
    removers.push(ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
      if (earned || done) return;
      earned = true;
      logAd('reward-earned', { placement });
      // Observe failed persistence immediately; duplicate SDK callbacks are ignored.
      save = Promise.resolve().then(onEarned).then(
        (applied) => applied === false ? 'cancelled' : 'earned',
        () => { logAd('reward-save-failed', { placement }); return 'save-failed'; },
      );
    }));
    removers.push(ad.addAdEventListener(ads.AdEventType.CLOSED, () => { void finish('dismissed'); }));
    removers.push(ad.addAdEventListener(ads.AdEventType.ERROR, (error) => {
      logAd('show-error', { kind: 'rewarded', code: adErrorCode(error) });
      void finish('show-error');
    }));
    removers.push(ad.addAdEventListener(ads.AdEventType.OPENED, () => logAd('opened', { kind: 'rewarded' })));
    removers.push(ad.addAdEventListener(ads.AdEventType.IMPRESSION, () => logAd('impression', { kind: 'rewarded' })));
    const timeout = adTimer(() => { void finish('timeout'); }, 120_000);
    try {
      void ad.show().catch((error: unknown) => {
        logAd('show-error', { kind: 'rewarded', code: adErrorCode(error) });
        void finish('show-error');
      });
    } catch (error) {
      logAd('show-error', { kind: 'rewarded', code: adErrorCode(error) });
      void finish('show-error');
    }
  });
}

// The existing Results reward remains 50 coins; new placements choose their
// benefit through watchRewarded without introducing a second SDK/ad unit.
export const watchRewardedForCoins = (awardCoins: (amount: number) => Promise<void>) =>
  watchRewarded(() => awardCoins(REWARDED_COINS), 'results-coins');