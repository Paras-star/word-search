import { CATEGORIES, type Category } from '@/data/categories';

export function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date : null;
}

export function dailyWindow(now: Date = new Date()): string[] {
  return Array.from({ length: 6 }, (_, index) =>
    localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5 + index)));
}

export function isDailyDatePlayable(key: string, now: Date = new Date()): boolean {
  const date = parseLocalDateKey(key);
  if (!date) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const earliest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5);
  return date >= earliest && date <= today;
}

export function dailySeed(key: string): string {
  if (!parseLocalDateKey(key)) throw new Error('Invalid daily puzzle date');
  return `word-hunt-daily-v1:${key}`;
}

export function dailyCategory(key: string): Category {
  if (!parseLocalDateKey(key)) throw new Error('Invalid daily puzzle date');
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const theme = CATEGORIES[(hash >>> 0) % CATEGORIES.length];
  return {
    id: `daily-${key}`,
    name: 'Daily Puzzle',
    emoji: theme.emoji,
    words: theme.words.slice(0, 9),
  };
}