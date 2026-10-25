export const HOME_REWARDED_COINS = 100;
export const REWARDED_HINTS = 3;

export function createCoinReward(awardCoins: (amount: number) => Promise<void>) {
  let claimed = false;
  return async (): Promise<void | false> => {
    if (claimed) return false;
    claimed = true;
    await awardCoins(HOME_REWARDED_COINS);
  };
}

export function createHintReward(
  puzzleId: string,
  getActivePuzzleId: () => string | null,
  addHints: (amount: number) => void,
) {
  let claimed = false;
  return (): boolean => {
    if (claimed || getActivePuzzleId() !== puzzleId) return false;
    claimed = true;
    addHints(REWARDED_HINTS);
    return true;
  };
}
