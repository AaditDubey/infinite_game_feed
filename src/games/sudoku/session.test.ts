import type { StoreApi } from 'zustand';

import { EMPTY_HISTORY } from '@/puzzles/loader';
import { appendResult, loadSudoku, saveGame, savePlayHistory } from '@/storage/persistence';
import { elapsedMs } from '@/timer/stopwatch';

import { createGame, placeDigit, toggleNote } from './engine';
import { useSudokuSession } from './session';
import { catalog, load } from './source';
import { createSudokuStore, type SudokuState } from './store';
import type { Band, Digit, GameState, GridSize, Puzzle } from './types';

jest.mock('@/haptics/haptics', () => ({ tapForMistake: jest.fn() }));
jest.mock('@/storage/persistence', () => ({
  loadSudoku: jest.fn(),
  saveGame: jest.fn(),
  savePlayHistory: jest.fn(),
  appendResult: jest.fn(),
}));

// The first band 1 puzzle in the 9×9 pack, so every run uses the same board.
const PUZZLE = catalog[0];

// A band's puzzles of one size, in pack order.
function puzzlesOf(band: Band, size: GridSize): Puzzle[] {
  return catalog.filter((puzzle) => puzzle.band === band && puzzle.size === size);
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

const session = () => useSudokuSession.getState();

// The store of the puzzle on screen.
function current(): StoreApi<SudokuState> {
  const { page } = session();
  if (page === null) {
    throw new Error('No puzzle on screen');
  }
  return page;
}

const store = () => current().getState();
const start = createGame(PUZZLE);
const empties = emptyCells(start);
const lastEmpty = empties[empties.length - 1];

// Fills every empty cell but the last one, then places the last digit at `solvedAt` ms.
function solveAt(solvedAt: number) {
  current().setState({ game: fillCorrectly(start, empties.slice(0, -1)) });
  store().select(lastEmpty);
  jest.setSystemTime(solvedAt);
  store().inputDigit(answer(start, lastEmpty));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  // PUZZLE was served last, so Next puzzle moves on to another one.
  load({ ...EMPTY_HISTORY, lastServed: [PUZZLE.id] });
  const page = createSudokuStore({ game: start, elapsedMs: 0 });
  page.getState().activate(0);
  useSudokuSession.setState({ page });
  // Activating saved the game, so every test starts with no calls recorded.
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('next puzzle and band picker', () => {
  it('serves another puzzle from the same band and starts it fresh', () => {
    solveAt(60_000);
    session().nextPuzzle();

    const { game, timer, selected } = store();
    expect(game.puzzle.band).toBe(1);
    expect(game.puzzle.id).not.toBe(PUZZLE.id);
    expect(game.mistakes).toBe(0);
    expect(selected).toBeNull();
    expect(timer).toEqual({ elapsedMs: 0, runningSince: 60_000 });
    expect(savePlayHistory).toHaveBeenLastCalledWith({
      solved: [PUZZLE.id],
      lastServed: expect.arrayContaining([game.puzzle.id]),
    });
  });

  it('turns Notes off for the next puzzle', () => {
    store().toggleNotesMode();
    session().nextPuzzle();
    expect(store().notesMode).toBe(false);
  });

  it('switches to a puzzle from the chosen band', () => {
    jest.setSystemTime(5_000);
    session().chooseBand(4);
    expect(store().game.puzzle.band).toBe(4);
    expect(store().timer).toEqual({ elapsedMs: 0, runningSince: 5_000 });
  });

  it('ignores the band already chosen', () => {
    const page = current();
    session().chooseBand(1);
    expect(current()).toBe(page);
    expect(store().game).toBe(start);
  });

  it('does nothing before there is a puzzle', () => {
    useSudokuSession.setState({ page: null });
    session().nextPuzzle();
    session().chooseBand(2);
    expect(session().page).toBeNull();
    expect(savePlayHistory).not.toHaveBeenCalled();
    expect(saveGame).not.toHaveBeenCalled();
  });
});

describe('restoring on launch', () => {
  let random: jest.SpyInstance;

  beforeEach(() => {
    useSudokuSession.setState({ page: null });
    jest.clearAllMocks();
    random = jest.spyOn(Math, 'random').mockReturnValue(0.99); // picks 9×9 when both are open
  });

  afterEach(() => {
    random.mockRestore();
  });

  it('starts out with no puzzle', () => {
    expect(useSudokuSession.getInitialState().page).toBeNull();
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
    await session().restore();

    expect(store().game).toBe(saved);
    expect(store().game.puzzle.band).toBe(3);
    expect(elapsedMs(store().timer, 1_010_000)).toBe(93_000);
    expect(savePlayHistory).not.toHaveBeenCalled(); // nothing new was served
  });

  it("serves the next unsolved puzzle in a solved game's band, in pack order", async () => {
    const [first, second, third] = puzzlesOf(4, 9);
    const firstGame = createGame(first);
    jest.mocked(loadSudoku).mockResolvedValueOnce({
      game: { state: fillCorrectly(firstGame, emptyCells(firstGame)), elapsedMs: 200_000 },
      playHistory: { solved: [first.id, second.id], lastServed: [first.id] },
    });
    jest.setSystemTime(5_000);
    await session().restore();

    expect(store().game.puzzle).toEqual(third);
    expect(store().timer).toEqual({ elapsedMs: 0, runningSince: 5_000 });
  });

  it('starts on Easy when nothing was saved, and saves the new puzzle', async () => {
    jest.mocked(loadSudoku).mockResolvedValueOnce({ game: null, playHistory: EMPTY_HISTORY });
    await session().restore();

    const { game } = store();
    expect(game.puzzle.band).toBe(1);
    expect(saveGame).toHaveBeenCalledWith(game, 0);
    expect(savePlayHistory).toHaveBeenCalledWith({ solved: [], lastServed: [game.puzzle.id] });
  });

  it('does nothing once there is a puzzle', async () => {
    const page = createSudokuStore({ game: start, elapsedMs: 0 });
    useSudokuSession.setState({ page });
    await session().restore();
    expect(loadSudoku).not.toHaveBeenCalled();
    expect(current()).toBe(page);
  });

  it('serves only one puzzle when restore() runs twice at once', async () => {
    const nothingSaved = { game: null, playHistory: EMPTY_HISTORY };
    jest.mocked(loadSudoku).mockResolvedValueOnce(nothingSaved).mockResolvedValueOnce(nothingSaved);
    await Promise.all([session().restore(), session().restore()]);
    expect(savePlayHistory).toHaveBeenCalledTimes(1);
  });
});

describe('saving and the results log', () => {
  it('saves the play history when a puzzle is solved and when the next one is served', () => {
    solveAt(1_000);
    expect(savePlayHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ solved: [PUZZLE.id] }),
    );
    session().nextPuzzle();
    expect(savePlayHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ lastServed: expect.arrayContaining([store().game.puzzle.id]) }),
    );
    expect(savePlayHistory).toHaveBeenCalledTimes(2);
  });

  it('saves the next puzzle in place of the solved one', () => {
    solveAt(1_000);
    session().nextPuzzle();
    expect(saveGame).toHaveBeenLastCalledWith(store().game, 0);
  });

  it('logs nothing more for Next puzzle', () => {
    solveAt(1_000);
    session().nextPuzzle();
    expect(appendResult).toHaveBeenCalledTimes(1);
  });

  // Abandons arrive with Phase 2's feed.
  it('logs nothing when the band picker leaves a puzzle unsolved', () => {
    session().chooseBand(3);
    expect(appendResult).not.toHaveBeenCalled();
  });
});
