import type { StoreApi } from 'zustand';

import { tapForMistake } from '@/haptics/haptics';
import { loadBundledCatalog } from '@/puzzles/loader';
import { appendResult, saveGame } from '@/storage/persistence';
import { elapsedMs } from '@/timer/stopwatch';

import { createGame, placeDigit } from './engine';
import { markAbandoned, markSolved } from './source';
import { createSudokuStore, type SudokuState } from './store';
import type { Digit, GameState } from './types';

jest.mock('@/haptics/haptics', () => ({ tapForMistake: jest.fn() }));
jest.mock('@/storage/persistence', () => ({ saveGame: jest.fn(), appendResult: jest.fn() }));
jest.mock('./source', () => ({ markSolved: jest.fn(), markAbandoned: jest.fn() }));

const CATALOG = loadBundledCatalog();

// The first band 1 puzzle in the 9×9 pack, so every run uses the same board.
const PUZZLE = CATALOG[0];

function emptyCells(game: GameState): number[] {
  return game.cells.flatMap((cell, index) => (cell.value === null ? [index] : []));
}

function answer(game: GameState, index: number): Digit {
  return Number(game.puzzle.solution[index]) as Digit; // solution chars are 1 to size
}

function wrongDigit(game: GameState, index: number): Digit {
  return answer(game, index) === 1 ? 2 : 1;
}

function fillCorrectly(game: GameState, indices: number[]): GameState {
  return indices.reduce((state, index) => placeDigit(state, index, answer(state, index)), game);
}

let page: StoreApi<SudokuState>;
const store = () => page.getState();
const start = createGame(PUZZLE);
const empties = emptyCells(start);
const [empty, otherEmpty] = empties;
const lastEmpty = empties[empties.length - 1];
const given = start.cells.findIndex((cell) => cell.given);
const solvedGame = fillCorrectly(start, empties);

// Fills every empty cell but the last one, then places the last digit at `solvedAt` ms.
function solveAt(solvedAt: number) {
  page.setState({ game: fillCorrectly(start, empties.slice(0, -1)) });
  store().select(lastEmpty);
  jest.setSystemTime(solvedAt);
  store().inputDigit(answer(start, lastEmpty));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  page = createSudokuStore({ game: start, elapsedMs: 0 });
  store().activate(0);
  // Activating saved the game, so every test starts with no calls recorded.
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('moves', () => {
  it('ignores digits until a cell is selected', () => {
    store().inputDigit(answer(start, empty));
    expect(store().game).toBe(start);
  });

  it('places a digit in the selected cell', () => {
    store().select(empty);
    store().inputDigit(answer(start, empty));
    expect(store().game.cells[empty].value).toBe(answer(start, empty));
  });

  it('toggles a note instead while Notes is on', () => {
    store().select(empty);
    store().toggleNotesMode();
    store().inputDigit(1);
    expect(store().game.cells[empty]).toMatchObject({ value: null, notes: [1] });
    store().toggleNotesMode();
    expect(store().notesMode).toBe(false);
  });

  it('erases the selected cell', () => {
    store().select(empty);
    store().toggleNotesMode();
    store().inputDigit(1);
    store().eraseSelected();
    expect(store().game.cells[empty].notes).toEqual([]);
  });

  it('undoes the last move', () => {
    store().select(empty);
    store().inputDigit(wrongDigit(start, empty));
    store().undo();
    expect(store().game.cells).toEqual(start.cells);
  });

  it('taps the phone for a wrong digit, and only then', () => {
    store().select(empty);
    store().inputDigit(wrongDigit(start, empty));
    store().inputDigit(answer(start, empty));
    store().select(otherEmpty);
    store().toggleNotesMode();
    store().inputDigit(wrongDigit(start, otherEmpty));
    expect(tapForMistake).toHaveBeenCalledTimes(1);
  });

  it('flashes the cells of a row that a correct digit completes', () => {
    const row = Array.from({ length: 9 }, (_, col) => Math.floor(empty / 9) * 9 + col);
    const others = row.filter((index) => index !== empty && start.cells[index].value === null);
    page.setState({ game: fillCorrectly(start, others), flash: { cells: [], id: 4 } });

    store().select(empty);
    store().inputDigit(answer(start, empty));
    expect(store().flash.id).toBe(5);
    expect(store().flash.cells).toEqual(expect.arrayContaining(row));
  });

  it("doesn't flash for a note or a digit that completes nothing", () => {
    const flash = store().flash;
    store().select(empty);
    store().inputDigit(answer(start, empty));
    store().select(otherEmpty);
    store().toggleNotesMode();
    store().inputDigit(1);
    expect(store().game.cells[otherEmpty].notes).toEqual([1]);
    expect(store().flash).toBe(flash);
  });

  it("doesn't update when the engine ignores a move", () => {
    store().select(given);
    const listener = jest.fn();
    const unsubscribe = page.subscribe(listener);
    store().inputDigit(1);
    store().eraseSelected();
    store().undo();
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
    expect(store().game).toBe(start);
  });

  it('keeps each puzzle to its own store', () => {
    const other = createSudokuStore({ game: start, elapsedMs: 0 });
    store().select(empty);
    store().inputDigit(answer(start, empty));
    expect(other.getState().selected).toBeNull();
    expect(other.getState().game).toBe(start);
  });
});

describe('timer and solving', () => {
  it('stops the timer at the solving move', () => {
    solveAt(90_000);
    expect(store().game.solved).toBe(true);
    expect(store().timer.runningSince).toBeNull();
    expect(elapsedMs(store().timer, 500_000)).toBe(90_000);
  });

  it('records the solve with the Sudoku source', () => {
    solveAt(1_000);
    expect(markSolved).toHaveBeenCalledTimes(1);
    expect(markSolved).toHaveBeenCalledWith(PUZZLE.id);
  });

  it("doesn't count time while the app is in the background", () => {
    store().deactivate(10_000);
    store().activate(70_000);
    expect(elapsedMs(store().timer, 75_000)).toBe(15_000);
  });

  it('stays stopped when the app comes back after a solve', () => {
    solveAt(30_000);
    store().deactivate(30_000);
    store().activate(40_000);
    expect(store().timer.runningSince).toBeNull();
    expect(elapsedMs(store().timer, 50_000)).toBe(30_000);
  });
});

describe('starting and leaving', () => {
  it('starts paused at the play time so far, and runs once activated', () => {
    const resumed = createSudokuStore({ game: start, elapsedMs: 83_000 });
    expect(resumed.getState().timer).toEqual({ elapsedMs: 83_000, runningSince: null });
    resumed.getState().activate(1_000_000);
    expect(elapsedMs(resumed.getState().timer, 1_010_000)).toBe(93_000);
  });

  it('saves nothing until activated', () => {
    jest.setSystemTime(1_000_000);
    const resumed = createSudokuStore({ game: start, elapsedMs: 83_000 });
    expect(saveGame).not.toHaveBeenCalled();
    resumed.getState().activate(1_000_000);
    expect(saveGame).toHaveBeenCalledWith(start, 83_000);
  });

  it("keeps a solved puzzle's timer stopped when activated", () => {
    const solved = createSudokuStore({ game: solvedGame, elapsedMs: 30_000 });
    solved.getState().activate(5_000);
    expect(solved.getState().timer).toEqual({ elapsedMs: 30_000, runningSince: null });
  });

  it('is just solved from the solving move until the puzzle is left', () => {
    store().select(empty);
    store().inputDigit(answer(start, empty));
    expect(store().justSolved).toBe(false);
    solveAt(1_000);
    expect(store().justSolved).toBe(true);
    store().deactivate(2_000);
    expect(store().justSolved).toBe(false);
    store().activate(3_000);
    expect(store().justSolved).toBe(false);
  });

  it("isn't just solved when made from a solved game", () => {
    const solved = createSudokuStore({ game: solvedGame, elapsedMs: 30_000 });
    solved.getState().activate(5_000);
    expect(solved.getState().justSolved).toBe(false);
  });
});

describe('saving', () => {
  it('saves the game after every move, with the play time so far', () => {
    store().select(empty);
    jest.setSystemTime(12_000);
    store().inputDigit(wrongDigit(start, empty));
    expect(saveGame).toHaveBeenLastCalledWith(store().game, 12_000);
    store().eraseSelected();
    store().undo();
    expect(saveGame).toHaveBeenCalledTimes(3);
  });

  it("doesn't save for a selection or the Notes toggle", () => {
    store().select(empty);
    store().toggleNotesMode();
    expect(saveGame).not.toHaveBeenCalled();
  });

  it('saves the play time when the puzzle is left or the app goes to the background', () => {
    jest.setSystemTime(40_000);
    store().deactivate(40_000);
    expect(saveGame).toHaveBeenCalledWith(start, 40_000);
  });

  it('saves the play time without pausing when asked to', () => {
    jest.setSystemTime(25_000);
    store().saveNow();
    expect(saveGame).toHaveBeenCalledWith(start, 25_000);
    expect(store().timer.runningSince).not.toBeNull();
  });
});

describe('results log', () => {
  it('logs a solve with the puzzle, band, time, play time and mistakes', () => {
    page.setState({
      game: { ...fillCorrectly(start, empties.slice(0, -1)), mistakes: 2 },
      timer: { elapsedMs: 5_000, runningSince: 10_000 }, // 5 s played before a restart
    });
    store().select(lastEmpty);
    jest.setSystemTime(90_000);
    store().inputDigit(answer(start, lastEmpty));

    expect(appendResult).toHaveBeenCalledTimes(1);
    expect(appendResult).toHaveBeenCalledWith({
      outcome: 'solved',
      puzzleId: PUZZLE.id,
      size: 9,
      band: 1,
      at: 90_000,
      elapsedMs: 85_000,
      mistakes: 2,
    });
  });
});

describe('abandoning', () => {
  it('logs the puzzle as abandoned, with its play time and mistakes so far', () => {
    store().select(empty);
    store().inputDigit(wrongDigit(start, empty));
    store().deactivate(30_000); // swiped away
    store().activate(100_000); // and back again
    store().deactivate(112_000); // then away for good
    store().abandon(112_000);

    expect(appendResult).toHaveBeenCalledWith({
      outcome: 'abandoned',
      puzzleId: PUZZLE.id,
      size: 9,
      band: 1,
      at: 112_000,
      elapsedMs: 42_000,
      mistakes: 1,
    });
  });

  it('records the abandon with the Sudoku source', () => {
    store().deactivate(30_000);
    store().abandon(30_000);
    expect(markAbandoned).toHaveBeenCalledWith(PUZZLE.id, 30_000);
  });

  it('does nothing for a solved puzzle, which is logged once, as solved', () => {
    solveAt(30_000);
    store().deactivate(30_000);
    store().abandon(40_000);
    expect(appendResult).toHaveBeenCalledTimes(1);
    expect(appendResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'solved' }));
    expect(markAbandoned).not.toHaveBeenCalled();
  });
});
