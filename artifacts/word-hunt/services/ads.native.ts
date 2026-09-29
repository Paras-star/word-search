import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import {
  ANDROID_AD_UNITS, INTERSTITIAL_EVERY_PUZZLES, MIN_INTERSTITIAL_INTERVAL_MS, REWARDED_COINS,
} from './adConfig';

type AdsSdk = typeof import('react-native-google-mobile-ads');
type Interstitial = ReturnType<AdsSdk['InterstitialAd']['createForAdRequest']>;
type Rewarded = ReturnType<AdsSdk['RewardedAd']['createForAdRequest']>;
type ConsentInfo = Awaited<ReturnType<AdsSdk['AdsConsent']['getConsentInfo']>>;
type WatchResult = 'earned' | 'closed' | 'unavailable' | 'save-failed';

let sdk: AdsSdk | null | undefined;
function getSdk(): AdsSdk | null {
  // Expo Go has no native AdMob module. iOS needs a production app/unit ID before ads can run.
  if (Platform.OS !== 'android' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  if (sdk !== undefined) return sdk;
  try {
    sdk = require('react-native-google-mobile-ads') as AdsSdk;
  } catch {
    sdk = null;
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

function discardLoadedAds() {
  interstitial?.destroy();
  rewarded?.destroy();
  interstitial = null;
  rewarded = null;
  interstitialReady = false;
  rewardedReady = false;
  notify();
}

function applyConsentInfo(ads: AdsSdk, info: ConsentInfo | null) {
  consentAllowed = info?.canRequestAds === true;
  privacyOptionsRequired = info?.privacyOptionsRequirementStatus === ads.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
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
        return applyConsentInfo(ads, await ads.AdsConsent.gatherConsent());
      } catch {
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
    consentPromise = Promise.resolve(consentAllowed);
    notify();
    if (consentAllowed) void prepareAds();
  }
  return shown;
}

function loadInterstitial(ads: AdsSdk) {
  if (interstitial || !canRequestAds()) return;
  const ad = ads.InterstitialAd.createForAdRequest(unitId('interstitial', ads));
  interstitial = ad;
  const unsubscribeLoaded = ad.addAdEventListener(ads.AdEventType.LOADED, () => { interstitialReady = true; });
  const unsubscribeError = ad.addAdEventListener(ads.AdEventType.ERROR, () => {
    unsubscribeLoaded();
    unsubscribeError();
    if (interstitial === ad) { interstitial = null; interstitialReady = false; }
    ad.destroy();
  });
  ad.load();
}

function loadRewarded(ads: AdsSdk) {
  if (rewarded || !canRequestAds()) return;
  const ad = ads.RewardedAd.createForAdRequest(unitId('rewarded', ads));
  rewarded = ad;
  const unsubscribeLoaded = ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
    rewardedReady = true;
    notify();
  });
  const unsubscribeError = ad.addAdEventListener(ads.AdEventType.ERROR, () => {
    unsubscribeLoaded();
    unsubscribeError();
    if (rewarded === ad) { rewarded = null; rewardedReady = false; notify(); }
    ad.destroy();
  });
  ad.load();
}

export async function prepareAds() {
  const ads = getSdk();
  if (!ads) return;
  if (!await refreshConsent(ads) || !canRequestAds()) return;
  initialized ??= ads.default().initialize().then(() => ads).catch(() => null);
  const ready = await initialized;
  if (!ready || !canRequestAds()) return;
  if (!adsReady) {
    adsReady = true;
    notify();
  }
  loadInterstitial(ready);
  loadRewarded(ready);
}

export function registerCompletedPuzzle(puzzleId: string) {
  if (seenPuzzles.has(puzzleId)) return;
  seenPuzzles.add(puzzleId);
  completedCount += 1;
}

export async function showInterstitialAtTransition() {
  const ads = getSdk();
  if (!ads || !canRequestAds() || !interstitial || !interstitialReady
    || completedCount < INTERSTITIAL_EVERY_PUZZLES
    || Date.now() - lastInterstitialAt < MIN_INTERSTITIAL_INTERVAL_MS) return;
  const ad = interstitial;
  interstitial = null;
  interstitialReady = false;
  await new Promise<void>((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        removeClosed();
        removeError();
        ad.destroy();
      } catch {
        // A native cleanup error must not prevent navigation.
      } finally {
        resolve();
        void prepareAds();
      }
    };
    const removeClosed = ad.addAdEventListener(ads.AdEventType.CLOSED, finish);
    const removeError = ad.addAdEventListener(ads.AdEventType.ERROR, finish);
    timeout = setTimeout(() => {
      // Treat an unconfirmed show as an attempt so a stalled SDK cannot
      // immediately serve another interstitial at the next transition.
      completedCount = 0;
      lastInterstitialAt = Date.now();
      finish();
    }, 60_000);
    try {
      void ad.show().then(() => {
        completedCount = 0;
        lastInterstitialAt = Date.now();
      }).catch(finish);
    } catch {
      finish();
    }
  });
}

export const isRewardedReady = () => canRequestAds() && rewardedReady && !watching && rewarded !== null;

export async function watchRewardedForCoins(awardCoins: (amount: number) => Promise<void>): Promise<WatchResult> {
  const ads = getSdk();
  if (!ads || !isRewardedReady() || !rewarded) return 'unavailable';
  const ad = rewarded;
  rewarded = null;
  rewardedReady = false;
  watching = true;
  notify();
  return new Promise<WatchResult>((resolve) => {
    let earned = false;
    let done = false;
    let save: Promise<boolean> | null = null;
    const finish = async () => {
      if (done) return;
      done = true;
      removeEarned();
      removeClosed();
      removeError();
      ad.destroy();
      watching = false;
      notify();
      void prepareAds();
      if (!earned) { resolve('closed'); return; }
      resolve(await save ? 'earned' : 'save-failed');
    };
    const removeEarned = ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
      if (earned) return;
      earned = true;
      // Observe failed saves immediately, even when the ad has not closed yet.
      save = Promise.resolve().then(() => awardCoins(REWARDED_COINS)).then(() => true, () => false);
    });
    const removeClosed = ad.addAdEventListener(ads.AdEventType.CLOSED, () => { void finish(); });
    const removeError = ad.addAdEventListener(ads.AdEventType.ERROR, () => { void finish(); });
    try {
      void ad.show().catch(() => { void finish(); });
    } catch {
      void finish();
    }
  });
}