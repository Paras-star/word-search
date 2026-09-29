// Web and other non-native runtimes remain fully playable without an ad SDK.
export const isAdsSupported = () => false;
export const canRequestAds = () => false;
export const isAdsReady = () => false;
export const canOpenPrivacyOptions = () => false;
export const showPrivacyOptions = async () => false;
export const isRewardedReady = () => false;
export const prepareAds = async () => {};
export const registerCompletedPuzzle = (_puzzleId: string) => {};
export const showInterstitialAtTransition = async () => {};
export const watchRewardedForCoins = async (_awardCoins: (amount: number) => Promise<void>):
  Promise<'earned' | 'closed' | 'unavailable' | 'save-failed'> => 'unavailable';
export const subscribeToAds = (_listener: () => void) => () => {};