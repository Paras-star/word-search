import type { InterstitialAd, RewardedAd } from 'react-native-google-mobile-ads';
import {
  canRequestAdsNow, consentAllowsAds, privacyOptionsRequired,
  showPrivacyOptions as openPrivacyOptions,
} from '@/services/consent';
import { getNativeAdSdk } from '@/services/nativeAdSdk';

// These existing production identifiers are used only in release builds.
export const ADS_CONFIG = {
  appId: 'ca-app-pub-9827389269181842~4120089237',
  interstitial: 'ca-app-pub-9827389269181842/1693753369',
  rewarded: 'ca-app-pub-9827389269181842/4711116175',
  banner: 'ca-app-pub-9827389269181842/1228070692',
} as const;

export const REWARDED_COINS = 50;
export const INTERSTITIAL_EVERY_PUZZLES = 3;
const MIN_INTERSTITIAL_INTERVAL_MS = 120_000;
// A release-mode test build must not automatically serve live ads.
const USE_PRODUCTION_ADS = !__DEV__ && process.env.EXPO_PUBLIC_ADMOB_PRODUCTION === 'true';

let initialization: Promise<boolean> | undefined;
let adsPermitted = false;
let interstitial: InterstitialAd | undefined;
let interstitialLoaded = false;
let interstitialLoading = false;
let rewarded: RewardedAd | undefined;
let rewardedLoaded = false;
let rewardedLoading = false;
let watching = false;
let completedCount = 0;
let due = false;
let lastInterstitialAt = 0;
const countedPuzzles = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeToAds(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isAdsSupported() {
  return getNativeAdSdk() !== null;
}

export function isRewardedReady() {
  return rewardedLoaded && !watching;
}

export function canChangeAdPrivacy() {
  return privacyOptionsRequired();
}

export async function showPrivacyOptions(): Promise<boolean> {
  if (!(await openPrivacyOptions())) return false;
  adsPermitted = await canRequestAdsNow();
  // Discard ads loaded under the previous consent choice before requesting more.
  interstitial?.destroy();
  rewarded?.destroy();
  interstitial = undefined;
  rewarded = undefined;
  interstitialLoaded = false;
  rewardedLoaded = false;
  interstitialLoading = false;
  rewardedLoading = false;
  if (adsPermitted && await initialization) setupAds();
  notify();
  return true;
}

export function adsArePermitted() {
  return adsPermitted;
}

export function bannerUnitId(): string | null {
  const sdk = getNativeAdSdk();
  return sdk ? (USE_PRODUCTION_ADS ? ADS_CONFIG.banner : sdk.TestIds.ADAPTIVE_BANNER) : null;
}

function loadInterstitial() {
  const sdk = getNativeAdSdk();
  if (!sdk || !interstitial || interstitialLoaded || interstitialLoading) return;
  interstitialLoading = true;
  try {
    interstitial.load();
  } catch {
    interstitialLoading = false;
  }
}

function loadRewarded() {
  const sdk = getNativeAdSdk();
  if (!sdk || !rewarded || rewardedLoaded || rewardedLoading || watching) return;
  rewardedLoading = true;
  try {
    rewarded.load();
  } catch {
    rewardedLoading = false;
    notify();
  }
}

function setupAds() {
  const sdk = getNativeAdSdk();
  if (!sdk) return;
  if (!interstitial) {
    interstitial = sdk.InterstitialAd.createForAdRequest(USE_PRODUCTION_ADS ? ADS_CONFIG.interstitial : sdk.TestIds.INTERSTITIAL);
    interstitial.addAdEventListener(sdk.AdEventType.LOADED, () => {
      interstitialLoaded = true;
      interstitialLoading = false;
      notify();
    });
    interstitial.addAdEventListener(sdk.AdEventType.ERROR, () => {
      interstitialLoaded = false;
      interstitialLoading = false;
      notify();
    });
    interstitial.addAdEventListener(sdk.AdEventType.CLOSED, () => {
      interstitialLoaded = false;
      interstitialLoading = false;
      loadInterstitial();
    });
  }
  if (!rewarded) {
    rewarded = sdk.RewardedAd.createForAdRequest(USE_PRODUCTION_ADS ? ADS_CONFIG.rewarded : sdk.TestIds.REWARDED);
    rewarded.addAdEventListener(sdk.RewardedAdEventType.LOADED, () => {
      rewardedLoaded = true;
      rewardedLoading = false;
      notify();
    });
    rewarded.addAdEventListener(sdk.AdEventType.ERROR, () => {
      rewardedLoaded = false;
      rewardedLoading = false;
      notify();
    });
  }
  loadInterstitial();
  loadRewarded();
}

export async function prepareAds(): Promise<boolean> {
  const sdk = getNativeAdSdk();
  if (!sdk) return false;
  if (!initialization) {
    initialization = (async () => {
      if (!(await consentAllowsAds())) return false;
      adsPermitted = true;
      await sdk.default().initialize();
      setupAds();
      return true;
    })().catch(() => false);
  }
  const available = await initialization;
  if (available && adsPermitted) {
    loadInterstitial();
    loadRewarded();
  }
  notify();
  return available && adsPermitted;
}

export function registerCompletedPuzzle(puzzleId: string) {
  if (!puzzleId || countedPuzzles.has(puzzleId)) return;
  countedPuzzles.add(puzzleId);
  completedCount++;
  if (completedCount % INTERSTITIAL_EVERY_PUZZLES === 0) due = true;
}

export async function showInterstitialAtTransition(): Promise<void> {
  if (!due) return;
  due = false;
  const sdk = getNativeAdSdk();
  const ad = interstitial;
  if (!sdk || !adsPermitted || !ad || !interstitialLoaded || Date.now() - lastInterstitialAt < MIN_INTERSTITIAL_INTERVAL_MS) return;
  interstitialLoaded = false;
  lastInterstitialAt = Date.now();
  await new Promise<void>((resolve) => {
    let finished = false;
    let opened = false;
    let timer: ReturnType<typeof setTimeout>;
    let presentationTimer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(presentationTimer);
      removeOpened();
      removeClosed();
      removeError();
      resolve();
    };
    const removeOpened = ad.addAdEventListener(sdk.AdEventType.OPENED, () => {
      opened = true;
      clearTimeout(presentationTimer);
    });
    const removeClosed = ad.addAdEventListener(sdk.AdEventType.CLOSED, finish);
    const removeError = ad.addAdEventListener(sdk.AdEventType.ERROR, finish);
    // Fail open if the native SDK never confirms that the ad appeared.
    presentationTimer = setTimeout(() => { if (!opened) finish(); }, 2_000);
    // An abnormal native lifecycle must not hold the chosen route indefinitely.
    timer = setTimeout(finish, 30_000);
    try {
      void ad.show().catch(finish);
    } catch {
      finish();
    }
  });
}

export type RewardedResult = 'earned' | 'closed' | 'unavailable' | 'save-failed' | 'delayed';

export async function watchRewardedForCoins(awardCoins: (amount: number) => Promise<void>): Promise<RewardedResult> {
  const sdk = getNativeAdSdk();
  const ad = rewarded;
  if (!sdk || !adsPermitted || !ad || !rewardedLoaded || watching) return 'unavailable';
  watching = true;
  rewardedLoaded = false;
  notify();
  return new Promise<RewardedResult>((resolve) => {
    let earned = false;
    let finished = false;
    let settled = false;
    let credit: Promise<void> | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const settle = (result: RewardedResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const finish = async () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      removeEarned();
      removeClosed();
      removeError();
      let result: RewardedResult = earned ? 'earned' : 'closed';
      try {
        await credit;
      } catch {
        result = 'save-failed';
      }
      watching = false;
      loadRewarded();
      notify();
      settle(result);
    };
    const removeEarned = ad.addAdEventListener(sdk.RewardedAdEventType.EARNED_REWARD, () => {
      if (earned) return;
      earned = true;
      credit = awardCoins(REWARDED_COINS);
    });
    const removeClosed = ad.addAdEventListener(sdk.AdEventType.CLOSED, () => { void finish(); });
    const removeError = ad.addAdEventListener(sdk.AdEventType.ERROR, () => { void finish(); });
    // Return control to the screen, but keep the earned-reward listener alive.
    // A late native reward still goes through the existing coin persistence.
    timer = setTimeout(() => settle('delayed'), 45_000);
    try {
      void ad.show().catch(() => { void finish(); });
    } catch {
      void finish();
    }
  });
}