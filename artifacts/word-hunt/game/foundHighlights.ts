import type { Cell } from './types';

export const FOUND_WORD_COLORS = [
  '#F8D7B5', '#F2B8D0', '#B8C9EE', '#D5E7B8',
  '#B8DDD8', '#D2C4EE', '#B9E0D0', '#F3DFB0',
] as const;

function pathsTouch(first: readonly Cell[], second: readonly Cell[]): boolean {
  return first.some((cell) => second.some((other) =>
    Math.abs(cell.row - other.row) <= 1 && Math.abs(cell.col - other.col) <= 1));
}

/** Rebuild from discovery order, never from render order or randomness. */
export function buildFoundHighlights(
  foundWords: readonly string[],
  foundPaths: Readonly<Record<string, readonly Cell[]>>,
) {
  const wordColors = new Map<string, string>();
  const cellColors = new Map<string, string>();
  const uses: number[] = FOUND_WORD_COLORS.map(() => 0);
  const previous: { cells: readonly Cell[]; colorIndex: number }[] = [];

  foundWords.forEach((word, index) => {
    const cells = foundPaths[word];
    if (!cells?.length || wordColors.has(word)) return;
    const adjacentColors = new Set(previous
      .filter((path) => pathsTouch(cells, path.cells))
      .map((path) => path.colorIndex));
    const cycle = FOUND_WORD_COLORS.map((_, offset) => (index + offset) % FOUND_WORD_COLORS.length);
    const alternatives = cycle.filter((colorIndex) => !adjacentColors.has(colorIndex));
    const candidates = alternatives.length ? alternatives : cycle;
    const fewestUses = Math.min(...candidates.map((colorIndex) => uses[colorIndex]));
    const colorIndex = candidates.find((candidate) => uses[candidate] === fewestUses)!;
    const color = FOUND_WORD_COLORS[colorIndex];
    uses[colorIndex] += 1;
    wordColors.set(word, color);
    previous.push({ cells, colorIndex });
    cells.forEach((cell) => {
      const key = `${cell.row}-${cell.col}`;
      // Keep the existing first-found ownership of intersecting cells.
      if (!cellColors.has(key)) cellColors.set(key, color);
    });
  });

  return { wordColors, cellColors };
}