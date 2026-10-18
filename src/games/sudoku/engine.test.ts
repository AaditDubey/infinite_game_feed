import {
  completedDigits,
  completedUnits,
  createGame,
  erase,
  highlights,
  isSolved,
  placeDigit,
  toggleNote,
  undo,
} from './engine';
import { BOX_SHAPES, type Digit, type GameState, type GridSize, type Puzzle } from './types';

// Real puzzles copied from the bundled packs.
const PUZZLE_9X9: Puzzle = {
  id: 'sudoku-9x9-001-0001',
  band: 1,
  size: 9,
  givens: '080527000560800000070000030608050094005103200720040503090000050000009048000385070',
  solution: '389527416564831729172496835638752194945163287721948563893274651257619348416385972',
};

// Row by row: 002000 / 045000 / 020601 / 506030 / 000160 / 000400.
const PUZZLE_6X6: Puzzle = {
  id: 'sudoku-6x6-001-0001',
  band: 1,
  size: 6,
  givens: '002000045000020601506030000160000400',
  solution: '132546645312423651516234254163361425',
};

function answer(game: GameState, index: number): Digit {
  return Number(game.puzzle.solution[index]) as Digit; // solution chars are 1 to size
}

function wrongDigit(game: GameState, index: number): Digit {
  return answer(game, index) === 1 ? 2 : 1;
}

function emptyCells(game: GameState): number[] {
  return game.cells.flatMap((cell, index) => (cell.value === null ? [index] : []));
}

function fillCorrectly(game: GameState, indices: number[]): GameState {
  return indices.reduce((state, index) => placeDigit(state, index, answer(state, index)), game);
}

// Worked out separately from the engine: the row, column and box through a cell.
function unitsThrough(size: GridSize, index: number) {
  const { boxWidth, boxHeight } = BOX_SHAPES[size];
  const row = (cell: number) => Math.floor(cell / size);
  const col = (cell: number) => cell % size;
  const box = (cell: number) =>
    `${Math.floor(row(cell) / boxHeight)},${Math.floor(col(cell) / boxWidth)}`;
  const all = Array.from({ length: size * size }, (_, cell) => cell);
  return {
    row: all.filter((cell) => row(cell) === row(index)),
    column: all.filter((cell) => col(cell) === col(index)),
    box: all.filter((cell) => box(cell) === box(index)),
  };
}

function sameUnit(size: GridSize, a: number, b: number): boolean {
  return Object.values(unitsThrough(size, a)).some((unit) => unit.includes(b));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe.each([
  ['9×9', PUZZLE_9X9],
  ['6×6', PUZZLE_6X6],
])('%s', (_name, puzzle) => {
  const size = puzzle.size;
  const start = createGame(puzzle);
  const [first, second] = emptyCells(start);

  describe('createGame', () => {
    it('fills in the givens and leaves every other cell empty', () => {
      start.cells.forEach((cell, index) => {
        const given = puzzle.givens[index] !== '0';
        expect(cell).toEqual({
          value: given ? Number(puzzle.givens[index]) : null,
          given,
          notes: [],
          wrong: false,
        });
      });
      expect(start.cells).toHaveLength(size * size);
      expect(start).toMatchObject({ puzzle, mistakes: 0, history: [], solved: false });
    });
  });

  describe('placeDigit', () => {
    it('places a correct digit without counting a mistake', () => {
      const game = placeDigit(start, first, answer(start, first));
      expect(game.cells[first]).toEqual({
        value: answer(start, first),
        given: false,
        notes: [],
        wrong: false,
      });
      expect(game.mistakes).toBe(0);
    });

    it('marks a wrong digit, counts a mistake, and keeps the digit', () => {
      const game = placeDigit(start, first, wrongDigit(start, first));
      expect(game.cells[first]).toMatchObject({ value: wrongDigit(start, first), wrong: true });
      expect(game.mistakes).toBe(1);
    });

    it('counts a mistake each time a wrong digit is replaced by another wrong one', () => {
      const correct = answer(start, first);
      const [wrongA, wrongB] = ([1, 2, 3] as Digit[]).filter((digit) => digit !== correct);
      const game = placeDigit(placeDigit(start, first, wrongA), first, wrongB);
      expect(game.cells[first]).toMatchObject({ value: wrongB, wrong: true });
      expect(game.mistakes).toBe(2);
    });

    it('replaces a wrong digit with the correct one, keeping the mistake count', () => {
      const wrong = placeDigit(start, first, wrongDigit(start, first));
      const game = placeDigit(wrong, first, answer(start, first));
      expect(game.cells[first]).toMatchObject({ value: answer(start, first), wrong: false });
      expect(game.mistakes).toBe(1);
    });

    it("clears the cell's own notes", () => {
      const noted = toggleNote(toggleNote(start, first, 1), first, 2);
      expect(placeDigit(noted, first, answer(start, first)).cells[first].notes).toEqual([]);
      expect(placeDigit(noted, first, wrongDigit(start, first)).cells[first].notes).toEqual([]);
    });

    it('removes a correct digit from notes in its row, column and box, and nowhere else', () => {
      const digit = answer(start, first);
      const others = emptyCells(start).filter((index) => index !== first);
      const noted = others.reduce((game, index) => toggleNote(game, index, digit), start);

      const game = placeDigit(noted, first, digit);
      for (const index of others) {
        expect(game.cells[index].notes).toEqual(sameUnit(size, first, index) ? [] : [digit]);
      }
      expect(others.some((index) => sameUnit(size, first, index))).toBe(true);
      expect(others.some((index) => !sameUnit(size, first, index))).toBe(true);
    });

    it("keeps other digits in the cleaned-up cells' notes", () => {
      const digit = answer(start, first);
      const peer = emptyCells(start).find(
        (index) => index !== first && sameUnit(size, first, index),
      );
      if (peer === undefined) throw new Error('fixture needs an empty peer');
      const other = digit === 1 ? 2 : 1;
      const noted = toggleNote(toggleNote(start, peer, digit), peer, other);
      expect(placeDigit(noted, first, digit).cells[peer].notes).toEqual([other]);
    });

    it('leaves notes alone when the digit is wrong', () => {
      const digit = wrongDigit(start, first);
      const noted = toggleNote(start, second, digit);
      expect(placeDigit(noted, first, digit).cells[second].notes).toEqual([digit]);
    });

    it('ignores a given cell', () => {
      const given = start.cells.findIndex((cell) => cell.given);
      expect(placeDigit(start, given, wrongDigit(start, given))).toBe(start);
    });

    it('locks a cell once it holds the correct digit', () => {
      const game = placeDigit(start, first, answer(start, first));
      expect(placeDigit(game, first, wrongDigit(start, first))).toBe(game);
      expect(erase(game, first)).toBe(game);
    });

    it('ignores placing the digit the cell already holds', () => {
      const game = placeDigit(start, first, wrongDigit(start, first));
      expect(placeDigit(game, first, wrongDigit(start, first))).toBe(game);
    });

    it('throws for a digit above the grid size or a cell off the board', () => {
      const tooBig = (size + 1) as Digit; // deliberately out of range
      expect(() => placeDigit(start, first, tooBig)).toThrow(RangeError);
      expect(() => toggleNote(start, first, tooBig)).toThrow(RangeError);
      for (const index of [-1, size * size, 1.5]) {
        expect(() => placeDigit(start, index, 1)).toThrow(RangeError);
        expect(() => erase(start, index)).toThrow(RangeError);
      }
    });
  });

  describe('toggleNote', () => {
    it('adds notes in sorted order and removes one on a second tap', () => {
      const game = [3, 1, 2].reduce(
        (state, digit) => toggleNote(state, first, digit as Digit),
        start,
      );
      expect(game.cells[first].notes).toEqual([1, 2, 3]);
      expect(toggleNote(game, first, 2).cells[first].notes).toEqual([1, 3]);
    });

    it('ignores given cells and cells with a digit', () => {
      const given = start.cells.findIndex((cell) => cell.given);
      expect(toggleNote(start, given, 1)).toBe(start);
      const placed = placeDigit(start, first, wrongDigit(start, first));
      expect(toggleNote(placed, first, 1)).toBe(placed);
    });
  });

  describe('erase', () => {
    it('clears a wrong digit without changing the mistake count', () => {
      const game = erase(placeDigit(start, first, wrongDigit(start, first)), first);
      expect(game.cells[first]).toEqual({ value: null, given: false, notes: [], wrong: false });
      expect(game.mistakes).toBe(1);
    });

    it('clears notes', () => {
      const game = erase(toggleNote(start, first, 1), first);
      expect(game.cells[first].notes).toEqual([]);
    });

    it('ignores given cells and empty cells', () => {
      const given = start.cells.findIndex((cell) => cell.given);
      expect(erase(start, given)).toBe(start);
      expect(erase(start, first)).toBe(start);
    });
  });

  describe('undo', () => {
    it('never takes back a correct digit', () => {
      const placed = placeDigit(start, first, answer(start, first));
      expect(placed.history).toEqual([]);
      expect(undo(placed)).toBe(placed);
    });

    it('goes back only as far as the last correct digit', () => {
      const placed = placeDigit(toggleNote(start, second, 1), first, answer(start, first));
      const undone = undo(toggleNote(placed, second, 2));
      expect(undone.cells).toEqual(placed.cells);
      expect(undo(undone)).toBe(undone);
    });

    it('reverts a wrong digit but keeps the mistake', () => {
      const game = undo(placeDigit(start, first, wrongDigit(start, first)));
      expect(game.cells).toEqual(start.cells);
      expect(game.mistakes).toBe(1);
    });

    it('reverts notes and erases one move at a time', () => {
      const noted = toggleNote(start, first, 1);
      const erased = erase(noted, first);
      expect(undo(erased).cells).toEqual(noted.cells);
      expect(undo(undo(erased)).cells).toEqual(start.cells);
    });

    it('goes all the way back to the start, with no depth limit', () => {
      let game = start;
      for (let move = 0; move < 60; move++) {
        game = toggleNote(game, move % 2 === 0 ? first : second, ((move % size) + 1) as Digit);
      }
      expect(game.history).toHaveLength(60);
      for (let move = 0; move < 60; move++) {
        game = undo(game);
      }
      expect(game.cells).toEqual(start.cells);
      expect(game.history).toEqual([]);
    });

    it('does nothing with no history', () => {
      expect(undo(start)).toBe(start);
    });

    it('records one undo step per move and none for an ignored move', () => {
      const game = placeDigit(start, first, wrongDigit(start, first));
      expect(game.history).toHaveLength(1);
      expect(placeDigit(game, first, wrongDigit(start, first)).history).toHaveLength(1);
    });
  });

  describe('solving', () => {
    const empty = emptyCells(start);
    const last = empty[empty.length - 1];
    const almost = fillCorrectly(start, empty.slice(0, -1));

    it('solves the puzzle when the last cell gets its correct digit', () => {
      expect(almost.solved).toBe(false);
      expect(isSolved(almost)).toBe(false);
      const solved = placeDigit(almost, last, answer(start, last));
      expect(solved.solved).toBe(true);
      expect(isSolved(solved)).toBe(true);
    });

    it('is not solved while a wrong digit remains', () => {
      const full = placeDigit(almost, last, wrongDigit(start, last));
      expect(full.cells.every((cell) => cell.value !== null)).toBe(true);
      expect(full.solved).toBe(false);
      expect(placeDigit(full, last, answer(start, last)).solved).toBe(true);
    });

    it('locks every move once solved', () => {
      const solved = placeDigit(almost, last, answer(start, last));
      expect(undo(solved)).toBe(solved);
      expect(erase(solved, last)).toBe(solved);
      expect(placeDigit(solved, last, wrongDigit(start, last))).toBe(solved);
    });
  });

  describe('highlights', () => {
    it('highlights the selected cell and its row, column and box', () => {
      const result = highlights(start, first);
      result.forEach((highlight, index) => {
        if (index === first) expect(highlight).toBe('selected');
        else expect(highlight).toBe(sameUnit(size, first, index) ? 'peer' : 'none');
      });
    });

    it('also highlights every other cell holding the selected digit', () => {
      const given = start.cells.findIndex((cell) => cell.given);
      const digit = start.cells[given].value;
      const result = highlights(start, given);
      result.forEach((highlight, index) => {
        if (index === given) expect(highlight).toBe('selected');
        else if (start.cells[index].value === digit) expect(highlight).toBe('sameDigit');
        else expect(highlight).toBe(sameUnit(size, given, index) ? 'peer' : 'none');
      });
      expect(result.filter((highlight) => highlight === 'sameDigit').length).toBeGreaterThan(0);
    });

    it('highlights nothing with no cell selected', () => {
      expect(highlights(start, null)).toEqual(Array(size * size).fill('none'));
    });
  });

  describe('completedUnits', () => {
    const units = unitsThrough(size, first);
    // Fills every other empty cell of the given units, leaving `first` as the last one.
    const fillAround = (...chosen: number[][]) =>
      fillCorrectly(
        start,
        [...new Set(chosen.flat())].filter(
          (index) => index !== first && start.cells[index].value === null,
        ),
      );

    it.each(['row', 'column', 'box'] as const)(
      'returns the %s a correct digit completes',
      (name) => {
        const game = placeDigit(fillAround(units[name]), first, answer(start, first));
        const complete = Object.values(units).filter((unit) =>
          unit.every((index) => game.cells[index].value === answer(start, index)),
        );
        expect(complete).toContainEqual(units[name]);
        expect(completedUnits(game, first)).toEqual(complete);
      },
    );

    it('returns the row, column and box together when one digit completes all three', () => {
      const around = fillAround(units.row, units.column, units.box);
      const game = placeDigit(around, first, answer(start, first));
      expect(completedUnits(game, first)).toEqual([units.row, units.column, units.box]);
    });

    it('returns nothing while a unit has an empty cell, a note or a wrong digit', () => {
      const around = fillAround(units.row);
      expect(completedUnits(start, first)).toEqual([]);
      expect(completedUnits(placeDigit(start, first, answer(start, first)), first)).toEqual([]);
      expect(completedUnits(toggleNote(around, first, 1), first)).toEqual([]);
      expect(completedUnits(placeDigit(around, first, wrongDigit(start, first)), first)).toEqual(
        [],
      );
    });
  });

  describe('completedDigits', () => {
    it('lists a digit once every copy of it is placed correctly', () => {
      const digit = answer(start, first);
      const cells = emptyCells(start).filter((index) => answer(start, index) === digit);
      const allButOne = fillCorrectly(start, cells.slice(0, -1));
      const lastCell = cells[cells.length - 1];

      expect(completedDigits(allButOne)).not.toContain(digit);
      expect(completedDigits(placeDigit(allButOne, lastCell, digit))).toContain(digit);
    });

    it("doesn't count a wrong copy of the digit", () => {
      const digit = answer(start, first);
      const cells = emptyCells(start).filter((index) => answer(start, index) === digit);
      const allButOne = fillCorrectly(start, cells.slice(0, -1));
      // Every other empty cell has a different answer, so the digit is wrong there.
      const elsewhere = emptyCells(allButOne).find((index) => index !== cells[cells.length - 1]);
      if (elsewhere === undefined) throw new Error('fixture needs another empty cell');

      const game = placeDigit(allButOne, elsewhere, digit);
      expect(game.cells.filter((cell) => cell.value === digit)).toHaveLength(size);
      expect(completedDigits(game)).not.toContain(digit);
    });
  });

  it('never changes the state it is given', () => {
    const digit = answer(start, first);
    const game = deepFreeze(toggleNote(toggleNote(start, second, digit), first, 1));
    const before = JSON.stringify(game);
    placeDigit(game, first, digit);
    placeDigit(game, first, wrongDigit(start, first));
    toggleNote(game, second, digit);
    erase(game, second);
    undo(game);
    highlights(game, first);
    completedDigits(game);
    expect(JSON.stringify(game)).toBe(before);
  });
});

describe('6×6 boxes are 3 wide and 2 tall', () => {
  // Cell 1 is row 0, column 1. Cell 6 (row 1, column 0) shares its box; cell 12 (row 2,
  // column 0) would only share it if boxes were 2 wide and 3 tall.
  const start = createGame(PUZZLE_6X6);

  it('cleans up notes in the 3-wide, 2-tall box', () => {
    const noted = toggleNote(toggleNote(start, 6, 3), 12, 3);
    const game = placeDigit(noted, 1, 3);
    expect(game.cells[6].notes).toEqual([]);
    expect(game.cells[12].notes).toEqual([3]);
  });

  it('highlights the 3-wide, 2-tall box', () => {
    const peers = highlights(start, 1).flatMap((highlight, index) =>
      highlight === 'peer' ? [index] : [],
    );
    // Row 0, column 1, and the box made of rows 0–1 and columns 0–2.
    expect(peers).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 13, 19, 25, 31]);
  });

  it.each([
    // The top-left box: cells 0, 1 and 6 are empty, and 2, 7 and 8 are givens.
    [
      [0, 6, 1],
      [0, 1, 2, 6, 7, 8],
    ],
    // The box in rows 2–3 and columns 3–5: cells 16, 23 and 21 are empty. Its top row is 2,
    // which boxes 3 tall would get wrong.
    [
      [16, 23, 21],
      [15, 16, 17, 21, 22, 23],
    ],
  ])('completes the 3-wide, 2-tall box when %j are filled', (fill, box) => {
    const game = fill.reduce(
      (state, index) => placeDigit(state, index, Number(PUZZLE_6X6.solution[index]) as Digit),
      start,
    );
    expect(completedUnits(game, fill[fill.length - 1])).toContainEqual(box);
  });
});
