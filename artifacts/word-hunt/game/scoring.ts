import type { GameMode } from './types';

export const HIGHLIGHT_COLORS = ['#eb4c4c', '#2f80ed', '#2eaa72', '#f6c445', '#f83f8f', '#ff8c1a', '#8b5cf6', '#15aabf', '#e64980', '#22b8cf', '#82c91e', '#7950f2', '#f59f00', '#20c997', '#d633c9', '#339af0', '#8bdc65', '#ffad5c'];

export function scoreFoundWord(currentScore: number, isTarget: boolean): number {
  return currentScore + (isTarget ? 10 : 5);
}

export function completionBonus(mode: GameMode, timeLeft: number): number {
  return mode === 'time' ? Math.max(0, Math.floor(timeLeft)) * 2 : 0;
}

export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}