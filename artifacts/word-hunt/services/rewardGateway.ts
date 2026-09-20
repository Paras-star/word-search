import type { GameMode } from '@/game/types';

export type PuzzleCompletion = {
  puzzleId: string;
  categoryId: string;
  mode: GameMode;
  score: number;
};

export interface RewardGateway {
  onPuzzleCompleted(input: PuzzleCompletion): Promise<void>;
}

/** Phase 1 intentionally has no reward records or reward-specific game logic. */
export const rewardGateway: RewardGateway = {
  async onPuzzleCompleted() {
    return Promise.resolve();
  },
};