import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDailyDatePlayable, parseLocalDateKey } from '@/game/daily';

const KEYS = {
  progress: '@word-hunt/progress-v2',
  coins: '@word-hunt/coins',
  completed: '@word-hunt/completed-levels',
} as const;
export const STARTING_COINS = 50;
export const PROGRESS_STORAGE_KEY = KEYS.progress;
export const DUMPLING_STORAGE_KEY = '@word-hunt/dumpling-rewards-v1';
export const TREASURE_TRANSACTION_KEY = '@word-hunt/treasure-transaction-v1';

// One durable record commits both sides of a purchase. Until the projections
// finish, every reader uses this record rather than partially updated keys.
export type TreasureTransaction = { version: 1; progress: string; collection: string };

export async function readTreasureTransaction(): Promise<TreasureTransaction | null> {
  const raw = await AsyncStorage.getItem(TREASURE_TRANSACTION_KEY);
  if (raw === null) return null;
  const value = JSON.parse(raw) as Partial<TreasureTransaction> | null;
  if (!value || value.version !== 1 || typeof value.progress !== 'string' || typeof value.collection !== 'string') {
    throw new Error('Saved treasure transaction could not be read. Your data has not been reset.');
  }
  parseProgress(value.progress);
  const collection = JSON.parse(value.collection);
  if (!collection || !Array.isArray(collection.rewards) || !Array.isArray(collection.ownedDumplingIds)
    || !collection.ownedDumplingIds.every((id: unknown) => typeof id === 'string')
    || (collection.pendingRewardId !== null && typeof collection.pendingRewardId !== 'string')) {
    throw new Error('Saved treasure collection could not be read. Your data has not been reset.');
  }
  return value as TreasureTransaction;
}

export async function readSavedGameItem(key: typeof PROGRESS_STORAGE_KEY | typeof DUMPLING_STORAGE_KEY): Promise<string | null> {
  const transaction = await readTreasureTransaction();
  if (transaction) return key === PROGRESS_STORAGE_KEY ? transaction.progress : transaction.collection;
  return AsyncStorage.getItem(key);
}

export type GameProgress = {
  coins: number;
  completedLevels: string[];
  onboardingStep: number;
  completedDailyPuzzles?: string[];
};

function parseNumber(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Saved coin balance is invalid');
  return parsed;
}

function parseLevels(value: string | null): string[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('Saved completed levels are invalid');
  }
  return [...new Set(parsed)];
}

function parseProgress(raw: string): GameProgress {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) throw new Error('Saved progress is invalid');
  const progress = value as Partial<GameProgress>;
  if (typeof progress.coins !== 'number' || !Number.isFinite(progress.coins) || progress.coins < 0
    || !Number.isInteger(progress.onboardingStep) || progress.onboardingStep! < 0 || progress.onboardingStep! > 6
    || !Array.isArray(progress.completedLevels)
    || !progress.completedLevels.every((id) => typeof id === 'string')
    || (progress.completedDailyPuzzles !== undefined
      && (!Array.isArray(progress.completedDailyPuzzles)
        || !progress.completedDailyPuzzles.every((key) => typeof key === 'string' && parseLocalDateKey(key))))) {
    throw new Error('Saved progress is invalid');
  }
  return {
    coins: progress.coins,
    completedLevels: [...new Set(progress.completedLevels)],
    onboardingStep: progress.onboardingStep!,
    ...(progress.completedDailyPuzzles === undefined
      ? {} : { completedDailyPuzzles: [...new Set(progress.completedDailyPuzzles)] }),
  };
}

export async function loadProgress(): Promise<GameProgress> {
  const saved = await readSavedGameItem(PROGRESS_STORAGE_KEY);
  if (saved !== null) return parseProgress(saved);

  const [coins, completed] = await AsyncStorage.multiGet([KEYS.coins, KEYS.completed]);
  const progress = {
    coins: parseNumber(coins[1], STARTING_COINS),
    completedLevels: parseLevels(completed[1]),
    onboardingStep: coins[1] !== null || completed[1] !== null ? 6 : 0,
  };
  await saveProgress(progress);
  return progress;
}

export function advanceOnboarding(progress: GameProgress, step: number): GameProgress | null {
  if (step < progress.onboardingStep) return null;
  if (!Number.isInteger(step) || step !== progress.onboardingStep || step < 0 || step >= 6) {
    throw new Error('Onboarding step is not available');
  }
  return { ...progress, coins: progress.coins + 10, onboardingStep: step + 1 };
}

export function awardDailyPuzzle(progress: GameProgress, dateKey: string, now: Date = new Date()): GameProgress | null {
  if (progress.onboardingStep < 6 || !isDailyDatePlayable(dateKey, now)) {
    throw new Error('Daily puzzle is not available');
  }
  if (progress.completedDailyPuzzles?.includes(dateKey)) return null;
  return {
    ...progress,
    coins: progress.coins + 20,
    completedDailyPuzzles: [...(progress.completedDailyPuzzles ?? []), dateKey],
  };
}

export async function saveProgress(progress: GameProgress): Promise<void> {
  await AsyncStorage.setItem(KEYS.progress, JSON.stringify(progress));
}