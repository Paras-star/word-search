import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = { coins: '@word-hunt/coins', completed: '@word-hunt/completed-levels' } as const;

function parseNumber(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseLevels(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
}

export async function loadProgress(): Promise<{ coins: number; completedLevels: string[] }> {
  const [coins, completed] = await AsyncStorage.multiGet([KEYS.coins, KEYS.completed]);
  return { coins: parseNumber(coins[1], 300), completedLevels: parseLevels(completed[1]) };
}

export async function saveCoins(coins: number) {
  await AsyncStorage.setItem(KEYS.coins, String(Math.max(0, Math.floor(coins))));
}

export async function saveCompletedLevels(levels: string[]) {
  await AsyncStorage.setItem(KEYS.completed, JSON.stringify([...new Set(levels)]));
}