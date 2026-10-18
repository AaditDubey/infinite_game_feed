import { tapForMistake } from '@/haptics/haptics';
import { EMPTY_HISTORY, loadBundledCatalog } from '@/puzzles/loader';
import { elapsedMs, start as startStopwatch } from '@/timer/stopwatch';

import { createGame, placeDigit } from './engine';
import { useSudokuStore } from './store';
import type { Digit, GameState } from './types';

jest.mock('@/haptics/haptics', () => ({ tapForMistake: jest.fn() }));

// The first band 1 puzzle in the 9×9 pack, so every run uses the same board.
const PUZZLE = loadBundledCatalog()[0];

function answer(game: GameState, index: number): Digit {
  return Number(game.puzzle.solution[index]) as Digit; // solution chars are 1 to size
}

function wrongDigit(game: GameState, index: number): Digit {
  return answer(game, index) === 1 ? 2 : 1;
}

function fillCorrectly(game: GameState, indices: number[]): GameState {
  return indices.reduce((state, index) => placeDigit(state, index, answer(state, index)), game);
}

const store = () => useSudokuStore.getState();
const start = createGame(PUZZLE);
const empties = start.cells.flatMap((cell, index) => (cell.value === null ? [index] : []));
const [empty, otherEmpty] = empties;
const lastEmpty = empties[empties.length - 1];
const given = start.cells.findIndex((cell) => cell.given);

// Fills every empty cell but the last one, then places the last digit at `solvedAt` ms.
function solveAt(solvedAt: number) {
  useSudokuStore.setState({ game: fillCorrectly(start, empties.slice(0, -1)) });
  store().select(lastEmpty);
  jest.setSystemTime(solvedAt);
  store().inputDigit(answer(start, lastEmpty));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  jest.mocked(tapForMistake).mockClear();
  useSudokuStore.setState({
    band: 1,
    // PUZZLE was served last, so Next puzzle moves on to another one.
    history: { ...EMPTY_HISTORY, lastServed: [PUZZLE.id] },
    game: start,
    timer: startStopwatch(0),
    selected: null,
    notesMode: false,
    flash: { cells: [], id: 0 },
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('moves', () => {
  it('opens on a band 1 puzzle with its timer running', () => {
    const initial = useSudokuStore.getInitialState();
    expect(initial.band).toBe(1);
    expect(initial.game.puzzle.band).toBe(1);
    expect(initial.timer.runningSince).not.toBeNull();
  });

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
    useSudokuStore.setState({ game: fillCorrectly(start, others), flash: { cells: [], id: 4 } });

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
    const unsubscribe = useSudokuStore.subscribe(listener);
    store().inputDigit(1);
    store().eraseSelected();
    store().undo();
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
    expect(store().game).toBe(start);
  });
});

describe('timer and solving', () => {
  it('stops the timer at the solving move', () => {
    solveAt(90_000);
    expect(store().game.solved).toBe(true);
    expect(store().timer.runningSince).toBeNull();
    expect(elapsedMs(store().timer, 500_000)).toBe(90_000);
  });

  it('records the solve in the play history', () => {
    solveAt(1_000);
    expect(store().history.solved).toEqual([PUZZLE.id]);
  });

  it("doesn't count time while the app is in the background", () => {
    jest.setSystemTime(10_000);
    store().pauseTimer();
    jest.setSystemTime(70_000);
    store().resumeTimer();
    jest.setSystemTime(75_000);
    expect(elapsedMs(store().timer, Date.now())).toBe(15_000);
  });

  it('stays stopped when the app comes back after a solve', () => {
    solveAt(30_000);
    store().pauseTimer();
    jest.setSystemTime(40_000);
    store().resumeTimer();
    expect(store().timer.runningSince).toBeNull();
    expect(elapsedMs(store().timer, 50_000)).toBe(30_000);
  });
});

describe('next puzzle and band picker', () => {
  it('serves another puzzle from the same band and starts it fresh', () => {
    solveAt(60_000);
    store().nextPuzzle();

    const { game, timer, selected, history } = store();
    expect(game.puzzle.band).toBe(1);
    expect(game.puzzle.id).not.toBe(PUZZLE.id);
    expect(game.mistakes).toBe(0);
    expect(selected).toBeNull();
    expect(timer).toEqual({ elapsedMs: 0, runningSince: 60_000 });
    expect(history.solved).toEqual([PUZZLE.id]);
    expect(history.lastServed).toContain(game.puzzle.id);
  });

  it('turns Notes off for the next puzzle', () => {
    store().toggleNotesMode();
    store().nextPuzzle();
    expect(store().notesMode).toBe(false);
  });

  it('switches to a puzzle from the chosen band', () => {
    jest.setSystemTime(5_000);
    store().chooseBand(4);
    expect(store().band).toBe(4);
    expect(store().game.puzzle.band).toBe(4);
    expect(store().timer).toEqual({ elapsedMs: 0, runningSince: 5_000 });
  });

  it('ignores the band already chosen', () => {
    store().chooseBand(1);
    expect(store().game).toBe(start);
  });
});
