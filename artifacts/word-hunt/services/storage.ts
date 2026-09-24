import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  progress: '@word-hunt/progress-v2',
  coins: '@word-hunt/coins',
  completed: '@word-hunt/completed-levels',
} as const;
export const STARTING_COINS = 50;

export type GameProgress = { coins: number; completedLevels: string[]; onboardingStep: number };

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
    || !progress.completedLevels.every((id) => typeof id === 'string')) {
    throw new Error('Saved progress is invalid');
  }
  return {
    coins: progress.coins,
    completedLevels: [...new Set(progress.completedLevels)],
    onboardingStep: progress.onboardingStep!,
  };
}

export async function loadProgress(): Promise<GameProgress> {
  const saved = await AsyncStorage.getItem(KEYS.progress);
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

export async function saveProgress(progress: GameProgress): Promise<void> {
  await AsyncStorage.setItem(KEYS.progress, JSON.stringify(progress));
}