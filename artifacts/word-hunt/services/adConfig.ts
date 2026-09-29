// Live IDs are used only in release builds. Development builds request Google's test ads.
export const ANDROID_AD_UNITS = {
  banner: 'ca-app-pub-9827389269181842/1228070692',
  interstitial: 'ca-app-pub-9827389269181842/1693753369',
  rewarded: 'ca-app-pub-9827389269181842/4711116175',
} as const;

export const REWARDED_COINS = 50;
export const INTERSTITIAL_EVERY_PUZZLES = 3;
export const MIN_INTERSTITIAL_INTERVAL_MS = 120_000;