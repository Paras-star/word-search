import type { Category } from '@/data/categories';
import { DAILY_WORDS } from '@/data/dailyWords';

const WORDS_PER_DAY = 9;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_EPOCH = Date.UTC(2026, 8, 25) / DAY_MS;
// Different lanes shift at each deck boundary, so the nine-word combination
// changes without repeating words in consecutive six-day windows.
const LANE_OFFSETS = [0, 5, 10, 15, 20, 25, 30, 35, 40];
const LANE_SHIFTS = [8, 9, 10, 11, 12, 13, 14, 15, 16];

function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}

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
  const date = parseLocalDateKey(key);
  if (!date) throw new Error('Invalid daily puzzle date');
  const laneLength = DAILY_WORDS.length / WORDS_PER_DAY;
  if (!Number.isInteger(laneLength) || laneLength < 16) throw new Error('Invalid Daily word pool');
  const dayIndex = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS - DAILY_EPOCH;
  const block = Math.floor(dayIndex / laneLength);
  const slot = wrap(dayIndex, laneLength);
  const words = LANE_OFFSETS.map((offset, lane) =>
    DAILY_WORDS[wrap(slot + offset + block * LANE_SHIFTS[lane], laneLength) * WORDS_PER_DAY + lane]);
  return {
    id: `daily-${key}`,
    name: 'Daily Puzzle',
    emoji: '🗓️',
    words,
  };
}