export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; // 6×6 uses 1–6

export type GridSize = 6 | 9;

export type Band = 1 | 2 | 3 | 4 | 5;

export interface Puzzle {
  id: string;
  band: Band;
  size: GridSize;
  givens: string; // size² chars, '0' = empty
  solution: string; // size² chars
}

export interface CellState {
  value: Digit | null;
  given: boolean;
  notes: Digit[]; // sorted, no duplicates
  wrong: boolean; // value differs from the solution
}

// One cell a move changed, as it was before the move. Undo puts it back.
export interface CellChange {
  index: number;
  before: CellState;
}

export interface GameState {
  puzzle: Puzzle;
  cells: CellState[]; // size², row-major
  mistakes: number;
  history: CellChange[][]; // one entry per move, oldest first
  solved: boolean;
}

// The only two grid shapes: 3×3 boxes on 9×9; 3 wide × 2 tall on 6×6.
export const BOX_SHAPES: Record<GridSize, { boxWidth: number; boxHeight: number }> = {
  9: { boxWidth: 3, boxHeight: 3 },
  6: { boxWidth: 3, boxHeight: 2 },
};

// A grid of size n uses the first n digits.
export const DIGITS: Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const BANDS: Band[] = [1, 2, 3, 4, 5];

// The app's name for each band, from the band table in docs/phase_1.md.
export const BAND_LABELS: Record<Band, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
  4: 'Expert',
  5: 'Master',
};
