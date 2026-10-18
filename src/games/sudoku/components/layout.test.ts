import { boxGrid, cellLabel } from './layout';

describe('boxGrid', () => {
  it.each([9, 6] as const)('lists every cell of a size %i grid exactly once', (size) => {
    const indices = boxGrid(size).flat(3);
    expect([...indices].sort((a, b) => a - b)).toEqual(
      Array.from({ length: size * size }, (_, i) => i),
    );
  });

  it('groups 9×9 cells into three rows of three 3×3 boxes', () => {
    const grid = boxGrid(9);
    expect(grid).toHaveLength(3);
    expect(grid[0]).toHaveLength(3);
    expect(grid[0][1]).toEqual([
      [3, 4, 5],
      [12, 13, 14],
      [21, 22, 23],
    ]);
  });

  it('groups 6×6 cells into three rows of two boxes, each 3 wide and 2 tall', () => {
    const grid = boxGrid(6);
    expect(grid).toHaveLength(3);
    expect(grid[0]).toHaveLength(2);
    expect(grid[0][1]).toEqual([
      [3, 4, 5],
      [9, 10, 11],
    ]);
    expect(grid[2][0]).toEqual([
      [24, 25, 26],
      [30, 31, 32],
    ]);
  });
});

describe('cellLabel', () => {
  it('names the row, the column and the digit, counting from 1', () => {
    expect(cellLabel(22, 9, 7)).toBe('Row 3, column 5, 7');
    expect(cellLabel(0, 9, null)).toBe('Row 1, column 1, empty');
  });

  it('uses the grid size to find the row and column', () => {
    expect(cellLabel(16, 6, 4)).toBe('Row 3, column 5, 4');
    expect(cellLabel(35, 6, null)).toBe('Row 6, column 6, empty');
  });
});
