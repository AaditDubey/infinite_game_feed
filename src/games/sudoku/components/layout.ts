import { BOX_SHAPES, type Digit, type GridSize } from '../types';

// Cell indices in the order the board draws them: rows of boxes, each box a list of its
// cell rows. On 6×6 that is three rows of two boxes, each 3 cells wide and 2 tall.
export function boxGrid(size: GridSize): number[][][][] {
  const { boxWidth, boxHeight } = BOX_SHAPES[size];
  const range = (length: number) => Array.from({ length }, (_, i) => i);
  return range(size / boxHeight).map((boxRow) =>
    range(size / boxWidth).map((boxCol) =>
      range(boxHeight).map((row) =>
        range(boxWidth).map((col) => (boxRow * boxHeight + row) * size + boxCol * boxWidth + col),
      ),
    ),
  );
}

// What a screen reader says for a cell, e.g. "Row 3, column 5, 7" or "Row 3, column 5, empty".
export function cellLabel(index: number, size: GridSize, value: Digit | null): string {
  const row = Math.floor(index / size) + 1;
  const column = (index % size) + 1;
  return `Row ${row}, column ${column}, ${value ?? 'empty'}`;
}
