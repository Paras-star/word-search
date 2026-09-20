export type GameMode = 'classic' | 'time';
export type Cell = { row: number; col: number };
export type PlacedWord = { word: string; start: Cell; end: Cell; cells: Cell[] };
export type Puzzle = {
  id: string;
  categoryId: string;
  size: number;
  grid: string[][];
  words: string[];
  placements: Record<string, PlacedWord>;
};