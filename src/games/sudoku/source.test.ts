import { EMPTY_HISTORY } from '@/puzzles/loader';
import { savePlayHistory } from '@/storage/persistence';

import { catalog, find, load, markSolved, pick } from './source';
import type { Band, GridSize, Puzzle } from './types';

jest.mock('@/storage/persistence', () => ({ savePlayHistory: jest.fn() }));

// A band's puzzles of one size, in pack order.
function puzzlesOf(band: Band, size: GridSize): Puzzle[] {
  return catalog.filter((puzzle) => puzzle.band === band && puzzle.size === size);
}

const nineByNine = () => 0.99; // picks 9×9 while both sizes have unplayed puzzles
const [first, second, third] = puzzlesOf(1, 9);

beforeEach(() => {
  load(EMPTY_HISTORY);
  jest.clearAllMocks();
});

describe('pick', () => {
  it('serves puzzles in pack order and saves the play history each time', () => {
    expect(pick(1, nineByNine)).toEqual(first);
    expect(savePlayHistory).toHaveBeenLastCalledWith({ solved: [], lastServed: [first.id] });
    expect(pick(1, nineByNine)).toEqual(second);
    expect(savePlayHistory).toHaveBeenLastCalledWith({ solved: [], lastServed: [second.id] });
  });

  it('picks the size with the random source', () => {
    expect(pick(2, () => 0).size).toBe(6);
    expect(pick(2, nineByNine).size).toBe(9);
  });

  it('carries on from the play history it was loaded with', () => {
    load({ solved: [first.id, second.id], lastServed: [] });
    expect(pick(1, nineByNine)).toEqual(third);
  });
});

describe('markSolved', () => {
  it('records the solve, saves it, and never serves the puzzle again', () => {
    markSolved(first.id);
    expect(savePlayHistory).toHaveBeenCalledWith({ solved: [first.id], lastServed: [] });
    expect(pick(1, nineByNine)).toEqual(second);
  });

  it("doesn't save again for a puzzle already solved", () => {
    markSolved(first.id);
    markSolved(first.id);
    expect(savePlayHistory).toHaveBeenCalledTimes(1);
  });
});

describe('find', () => {
  it('looks a puzzle up by id', () => {
    expect(find(third.id)).toBe(third);
    expect(find('sudoku-9x9-999-0001')).toBeUndefined();
  });
});
