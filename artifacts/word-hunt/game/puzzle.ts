import type { Category } from '@/data/categories';
import type { Cell, PlacedWord, Puzzle } from './types';

export const DIRECTIONS: Cell[] = [
  { row: 0, col: 1 }, { row: 0, col: -1 }, { row: 1, col: 0 }, { row: -1, col: 0 },
  { row: 1, col: 1 }, { row: -1, col: -1 }, { row: 1, col: -1 }, { row: -1, col: 1 },
];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function getGridSize(words: string[]): number {
  const longest = Math.max(...words.map((word) => word.length));
  if (words.length >= 16 || longest >= 10) return 12;
  if (words.length >= 12 || longest >= 7) return 10;
  return 8;
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += state << 13;
    state ^= state >>> 7;
    state += state << 3;
    state ^= state >>> 17;
    state += state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function cellsFor(word: string, start: Cell, direction: Cell): Cell[] {
  return Array.from({ length: word.length }, (_, index) => ({
    row: start.row + direction.row * index,
    col: start.col + direction.col * index,
  }));
}

function canPlace(grid: string[][], word: string, cells: Cell[]): boolean {
  return cells.every(({ row, col }) => row >= 0 && col >= 0 && row < grid.length && col < grid.length && (grid[row][col] === '' || grid[row][col] === word[cells.findIndex((cell) => cell.row === row && cell.col === col)]));
}

function placeWord(grid: string[][], word: string, cells: Cell[]) {
  cells.forEach((cell, index) => { grid[cell.row][cell.col] = word[index]; });
}

export function generatePuzzle(category: Category, seed = `${category.id}:default`): Puzzle {
  const size = getGridSize(category.words);
  const random = seededRandom(seed);
  const orderedWords = [...category.words].sort((a, b) => b.length - a.length);
  for (let restart = 0; restart < 80; restart += 1) {
    const grid = Array.from({ length: size }, () => Array<string>(size).fill(''));
    const placements: Record<string, PlacedWord> = {};
    let failed = false;
    for (const word of orderedWords) {
      const candidates: { start: Cell; direction: Cell; cells: Cell[] }[] = [];
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          for (const direction of shuffled(DIRECTIONS, random)) {
            const cells = cellsFor(word, { row, col }, direction);
            if (canPlace(grid, word, cells)) candidates.push({ start: { row, col }, direction, cells });
          }
        }
      }
      if (candidates.length === 0) { failed = true; break; }
      const candidate = candidates[Math.floor(random() * candidates.length)];
      placeWord(grid, word, candidate.cells);
      placements[word] = { word, start: candidate.start, end: candidate.cells[candidate.cells.length - 1], cells: candidate.cells };
    }
    if (!failed) {
      for (let row = 0; row < size; row += 1) for (let col = 0; col < size; col += 1) if (!grid[row][col]) grid[row][col] = LETTERS[Math.floor(random() * LETTERS.length)];
      return { id: `${category.id}-${seed}`, categoryId: category.id, size, grid, words: [...category.words], placements };
    }
  }
  throw new Error(`Unable to generate a puzzle for ${category.name}`);
}

export function lineCells(start: Cell, end: Cell, size: number): Cell[] {
  const rowDelta = end.row - start.row;
  const colDelta = end.col - start.col;
  const isStraight = rowDelta === 0 || colDelta === 0 || Math.abs(rowDelta) === Math.abs(colDelta);
  if (!isStraight) return [];
  const rowStep = Math.sign(rowDelta);
  const colStep = Math.sign(colDelta);
  const count = Math.max(Math.abs(rowDelta), Math.abs(colDelta)) + 1;
  return Array.from({ length: count }, (_, index) => ({ row: start.row + rowStep * index, col: start.col + colStep * index })).filter((cell) => cell.row >= 0 && cell.col >= 0 && cell.row < size && cell.col < size);
}

export type GridBounds = { x: number; y: number; width: number; height: number };

export function gridCellFromPoint(pageX: number, pageY: number, bounds: GridBounds, size: number): Cell | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const localX = pageX - bounds.x;
  const localY = pageY - bounds.y;
  if (localX < 0 || localY < 0 || localX >= bounds.width || localY >= bounds.height) return null;
  return {
    row: Math.min(size - 1, Math.floor((localY / bounds.height) * size)),
    col: Math.min(size - 1, Math.floor((localX / bounds.width) * size)),
  };
}

export function lettersFor(grid: string[][], cells: Cell[]): string {
  return cells.map(({ row, col }) => grid[row]?.[col] ?? '').join('');
}