import type { GameMode } from '@/game/types';
import { generateAndPersistReward } from '@/services/dumplingRewards';

export type PuzzleCompletion = {
  puzzleId: string;
  categoryId: string;
  mode: GameMode;
  score: number;
};

export interface RewardGateway {
  onPuzzleCompleted(input: PuzzleCompletion): Promise<void>;
}

export const rewardGateway: RewardGateway = {
  async onPuzzleCompleted(input) {
    await generateAndPersistReward(input);
  },
};