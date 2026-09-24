import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = { coins: '@word-hunt/coins', completed: '@word-hunt/completed-levels' } as const;
export const STARTING_COINS = 50;

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

export async function loadProgress(): Promise<{ coins: number; completedLevels: string[] }> {
  const [coins, completed] = await AsyncStorage.multiGet([KEYS.coins, KEYS.completed]);
  return { coins: parseNumber(coins[1], STARTING_COINS), completedLevels: parseLevels(completed[1]) };
}

export async function saveCoins(coins: number) {
  await AsyncStorage.setItem(KEYS.coins, String(Math.max(0, Math.floor(coins))));
}

export async function saveCompletedLevels(levels: string[]) {
  await AsyncStorage.setItem(KEYS.completed, JSON.stringify([...new Set(levels)]));
}