import { tapForMistake } from '@/haptics/haptics';
import { EMPTY_HISTORY, loadBundledCatalog } from '@/puzzles/loader';
import { appendResult, loadSudoku, saveGame, savePlayHistory } from '@/storage/persistence';
import { elapsedMs, start as startStopwatch } from '@/timer/stopwatch';

import { createGame, placeDigit, toggleNote } from './engine';
import { useSudokuStore } from './store';
import type { Band, Digit, GameState, GridSize, Puzzle } from './types';

jest.mock('@/haptics/haptics', () => ({ tapForMistake: jest.fn() }));
jest.mock('@/storage/persistence', () => ({
  loadSudoku: jest.fn(),
  saveGame: jest.fn(),
  savePlayHistory: jest.fn(),
  appendResult: jest.fn(),
}));

const CATALOG = loadBundledCatalog();

// The first band 1 puzzle in the 9×9 pack, so every run uses the same board.
const PUZZLE = CATALOG[0];

// A band's puzzles of one size, in pack order.
function puzzlesOf(band: Band, size: GridSize): Puzzle[] {
  return CATALOG.filter((puzzle) => puzzle.band === band && puzzle.size === size);
}

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

const store = () => useSudokuStore.getState();
const start = createGame(PUZZLE);
const empties = emptyCells(start);
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
  useSudokuStore.setState({
    ready: true,
    band: 1,
    // PUZZLE was served last, so Next puzzle moves on to another one.
    history: { ...EMPTY_HISTORY, lastServed: [PUZZLE.id] },
    game: start,
    timer: startStopwatch(0),
    selected: null,
    notesMode: false,
    flash: { cells: [], id: 0 },
  });
  // Setting the state above saved it, so every test starts with no calls recorded.
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

describe('restoring on launch', () => {
  let random: jest.SpyInstance;

  beforeEach(() => {
    useSudokuStore.setState({ ready: false });
    jest.clearAllMocks();
    random = jest.spyOn(Math, 'random').mockReturnValue(0.99); // picks 9×9 when both are open
  });

  afterEach(() => {
    random.mockRestore();
  });

  it('starts out not ready', () => {
    expect(useSudokuStore.getInitialState().ready).toBe(false);
  });

  it('resumes an unsolved saved game where it left off', async () => {
    const hard = createGame(puzzlesOf(3, 6)[0]);
    const [wrongCell, notedCell] = emptyCells(hard);
    const saved = toggleNote(
      placeDigit(hard, wrongCell, wrongDigit(hard, wrongCell)),
      notedCell,
      4,
    );
    const playHistory = { solved: [], lastServed: [hard.puzzle.id] };
    jest
      .mocked(loadSudoku)
      .mockResolvedValueOnce({ game: { state: saved, elapsedMs: 83_000 }, playHistory });
    jest.setSystemTime(1_000_000);
    await store().restore();

    expect(store()).toMatchObject({ ready: true, band: 3, game: saved, history: playHistory });
    expect(elapsedMs(store().timer, 1_010_000)).toBe(93_000);
  });

  it("serves the next unsolved puzzle in a solved game's band, in pack order", async () => {
    const [first, second, third] = puzzlesOf(4, 9);
    const firstGame = createGame(first);
    jest.mocked(loadSudoku).mockResolvedValueOnce({
      game: { state: fillCorrectly(firstGame, emptyCells(firstGame)), elapsedMs: 200_000 },
      playHistory: { solved: [first.id, second.id], lastServed: [first.id] },
    });
    jest.setSystemTime(5_000);
    await store().restore();

    expect(store().ready).toBe(true);
    expect(store().band).toBe(4);
    expect(store().game.puzzle).toEqual(third);
    expect(store().timer).toEqual({ elapsedMs: 0, runningSince: 5_000 });
  });

  it('starts on Easy when nothing was saved, and saves the new puzzle', async () => {
    jest.mocked(loadSudoku).mockResolvedValueOnce({ game: null, playHistory: EMPTY_HISTORY });
    await store().restore();

    expect(store().ready).toBe(true);
    expect(store().game.puzzle.band).toBe(1);
    expect(saveGame).toHaveBeenCalledWith(store().game, 0);
    expect(savePlayHistory).toHaveBeenCalledWith(store().history);
  });

  it('does nothing once the game is ready', async () => {
    useSudokuStore.setState({ ready: true });
    await store().restore();
    expect(loadSudoku).not.toHaveBeenCalled();
    expect(store().game).toBe(start);
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

  it('saves the play time when the app goes to the background', () => {
    jest.setSystemTime(40_000);
    store().pauseTimer();
    expect(saveGame).toHaveBeenCalledWith(start, 40_000);
  });

  it('saves the play time without pausing when asked to', () => {
    jest.setSystemTime(25_000);
    store().saveNow();
    expect(saveGame).toHaveBeenCalledWith(start, 25_000);
    expect(store().timer.runningSince).not.toBeNull();
  });

  it('saves the play history when a puzzle is solved and when the next one is served', () => {
    solveAt(1_000);
    expect(savePlayHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ solved: [PUZZLE.id] }),
    );
    store().nextPuzzle();
    expect(savePlayHistory).toHaveBeenLastCalledWith(store().history);
    expect(savePlayHistory).toHaveBeenCalledTimes(2);
  });

  it("doesn't save before restore() has run", () => {
    useSudokuStore.setState({ ready: false });
    store().select(empty);
    store().inputDigit(wrongDigit(start, empty));
    store().saveNow();
    expect(saveGame).not.toHaveBeenCalled();
  });
});

describe('results log', () => {
  it('logs a solve with the puzzle, band, time, play time and mistakes', () => {
    useSudokuStore.setState({
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

  it('logs nothing more for Next puzzle', () => {
    solveAt(1_000);
    store().nextPuzzle();
    expect(appendResult).toHaveBeenCalledTimes(1);
  });

  // Abandons arrive with Phase 2's swipe.
  it('logs nothing when the band picker leaves a puzzle unsolved', () => {
    store().chooseBand(3);
    expect(appendResult).not.toHaveBeenCalled();
  });
});
