import type { Puzzle } from './types';
import { dailyCategory, dailySeed } from './daily';
import { generatePuzzle } from './puzzle';

// The six playable dates can be revisited from the calendar without rebuilding
// their deterministic grids on every screen mount.
const puzzles = new Map<string, Puzzle>();
const MAX_CACHED_PUZZLES = 6;

export function getDailyPuzzle(dateKey: string): Puzzle {
  const cached = puzzles.get(dateKey);
  if (cached) return cached;

  const puzzle = generatePuzzle(dailyCategory(dateKey), dailySeed(dateKey));
  if (puzzles.size >= MAX_CACHED_PUZZLES) {
    puzzles.delete(puzzles.keys().next().value!);
  }
  puzzles.set(dateKey, puzzle);
  return puzzle;
}