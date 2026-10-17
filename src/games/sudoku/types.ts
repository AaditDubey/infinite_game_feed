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

// The only two grid shapes: 3×3 boxes on 9×9; 3 wide × 2 tall on 6×6.
export const BOX_SHAPES: Record<GridSize, { boxWidth: number; boxHeight: number }> = {
  9: { boxWidth: 3, boxHeight: 3 },
  6: { boxWidth: 3, boxHeight: 2 },
};
