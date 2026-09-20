import { Platform } from 'react-native';

export const ADS_CONFIG = {
  appId: 'ca-app-pub-9827389269181842~4120089237',
  interstitial: 'ca-app-pub-9827389269181842/1693753369',
  rewarded: 'ca-app-pub-9827389269181842/4711116175',
  banner: 'ca-app-pub-9827389269181842/1228070692',
} as const;

let eligibleTriggers = 0;
let lastInterstitialAt = 0;

export function registerInterstitialTrigger(): boolean {
  eligibleTriggers += 1;
  const now = Date.now();
  if (eligibleTriggers % 2 !== 0 || now - lastInterstitialAt < 60_000) return false;
  lastInterstitialAt = now;
  return Platform.OS !== 'web';
}

export async function showRewardedAdForHint(): Promise<boolean> {
  return false;
}

export function shouldShowBanner(): boolean {
  return Platform.OS !== 'web';
}