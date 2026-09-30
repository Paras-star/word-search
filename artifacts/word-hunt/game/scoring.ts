import type { GameMode } from './types';

import { homeColors } from '@/constants/homePalette';

export const HIGHLIGHT_COLORS = [
  homeColors.teal, homeColors.gold, homeColors.ink, homeColors.softInk, homeColors.tealBorder, homeColors.tileBorder,
  homeColors.teal, homeColors.gold, homeColors.ink, homeColors.softInk, homeColors.tealBorder, homeColors.tileBorder,
  homeColors.teal, homeColors.gold, homeColors.ink, homeColors.softInk, homeColors.tealBorder, homeColors.tileBorder,
];

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