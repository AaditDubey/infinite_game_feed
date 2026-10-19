import AsyncStorage from '@react-native-async-storage/async-storage';

import { createGame, placeDigit, toggleNote } from '@/games/sudoku/engine';
import type { Digit, GameState, GridSize, Puzzle } from '@/games/sudoku/types';
import { EMPTY_HISTORY, loadBundledCatalog, type PlayHistory } from '@/puzzles/loader';

import {
  KEYS,
  appendResult,
  loadResults,
  loadSudoku,
  saveGame,
  savePlayHistory,
  type ResultEntry,
} from './persistence';

// An in-memory AsyncStorage that ships with the package, so tests read back what they write.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const catalog = loadBundledCatalog();

function firstPuzzle(size: GridSize): Puzzle {
  const puzzle = catalog.find((p) => p.size === size);
  if (puzzle === undefined) {
    throw new Error(`No ${size}×${size} puzzle in the packs`);
  }
  return puzzle;
}

function emptyCells(puzzle: Puzzle): number[] {
  return [...puzzle.givens].flatMap((char, index) => (char === '0' ? [index] : []));
}

function answer(game: GameState, index: number): Digit {
  return Number(game.puzzle.solution[index]) as Digit; // solution chars are 1 to size
}

// A correct digit in the first empty cell, a wrong one in the second and two notes in the
// third, so the cells, mistakes and undo history all have something to save.
function playedGame(puzzle: Puzzle): GameState {
  const [correctCell, wrongCell, notedCell] = emptyCells(puzzle);
  let game = createGame(puzzle);
  game = placeDigit(game, correctCell, answer(game, correctCell));
  game = placeDigit(game, wrongCell, answer(game, wrongCell) === 1 ? 2 : 1);
  game = toggleNote(game, notedCell, 3);
  return toggleNote(game, notedCell, 1);
}

const HISTORY: PlayHistory = {
  solved: ['sudoku-9x9-001-0002'],
  lastServed: ['sudoku-9x9-001-0003', 'sudoku-6x6-001-0001'],
  abandonedAt: { 'sudoku-6x6-001-0001': 1_790_000_000_000 },
};

const SOLVE: ResultEntry = {
  outcome: 'solved',
  puzzleId: 'sudoku-9x9-001-0001',
  size: 9,
  band: 1,
  at: 1_790_000_000_000,
  elapsedMs: 83_000,
  mistakes: 2,
};

const ABANDON: ResultEntry = {
  outcome: 'abandoned',
  puzzleId: 'sudoku-6x6-001-0042',
  size: 6,
  band: 1,
  at: 1_792_400_000_000,
  elapsedMs: 48_000,
  mistakes: 1,
};

let warn: jest.SpyInstance;
let log: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  log = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  log.mockRestore();
});

describe('saved game', () => {
  it.each<{ size: GridSize }>([{ size: 9 }, { size: 6 }])(
    'comes back as it was saved, on $size×$size',
    async ({ size }) => {
      const game = playedGame(firstPuzzle(size));
      expect(game.mistakes).toBe(1);
      expect(game.history).toHaveLength(3);

      await saveGame(game, 83_000);
      const saved = await loadSudoku(catalog);
      expect(saved.game).toEqual({ state: game, elapsedMs: 83_000 });
    },
  );

  it('comes back solved when it was saved solved', async () => {
    const puzzle = firstPuzzle(6);
    const solved = emptyCells(puzzle).reduce(
      (game, index) => placeDigit(game, index, answer(game, index)),
      createGame(puzzle),
    );
    await saveGame(solved, 40_000);
    expect((await loadSudoku(catalog)).game?.state.solved).toBe(true);
  });

  it('stores the puzzle by id, not the whole puzzle', async () => {
    const game = playedGame(firstPuzzle(9));
    await saveGame(game, 0);
    const stored = JSON.parse((await AsyncStorage.getItem(KEYS.game)) ?? 'null');
    expect(stored.puzzleId).toBe(game.puzzle.id);
    expect(stored).not.toHaveProperty('puzzle');
  });

  it('is missing when nothing was saved', async () => {
    expect(await loadSudoku(catalog)).toEqual({ game: null, playHistory: EMPTY_HISTORY });
  });

  // The stored game as plain JSON, so tests can damage it.
  interface Stored {
    puzzleId: string;
    cells: { value: number | null; given: boolean; notes: number[]; wrong: boolean }[];
    mistakes: number;
    history: { index: number }[][];
    elapsedMs: number;
  }

  const puzzle = firstPuzzle(9);
  const [, wrongCell, notedCell] = emptyCells(puzzle);
  const givenCell = [...puzzle.givens].findIndex((char) => char !== '0');
  const untouchedCell = emptyCells(puzzle)[3];

  it.each<[string, (stored: Stored) => void]>([
    ['a puzzle id not in the packs', (s) => (s.puzzleId = 'sudoku-9x9-999-0001')],
    ['a cell missing', (s) => s.cells.pop()],
    [
      'a given that changed',
      (s) => (s.cells[givenCell].value = s.cells[givenCell].value === 1 ? 2 : 1),
    ],
    [
      'a digit beyond the grid',
      (s) => (s.cells[untouchedCell] = { value: 10, given: false, notes: [], wrong: true }),
    ],
    ['a wrong flag that disagrees with the solution', (s) => (s.cells[wrongCell].wrong = false)],
    ['notes out of order', (s) => (s.cells[notedCell].notes = [3, 1])],
    ['an undo step for a cell off the board', (s) => (s.history[0][0].index = 81)],
    ['a negative mistake count', (s) => (s.mistakes = -1)],
    ['a fractional play time', (s) => (s.elapsedMs = 1.5)],
  ])('is ignored when it has %s, and the play history still loads', async (_, damage) => {
    await saveGame(playedGame(puzzle), 83_000);
    await savePlayHistory(HISTORY);
    const stored: Stored = JSON.parse((await AsyncStorage.getItem(KEYS.game)) ?? 'null');
    damage(stored);
    await AsyncStorage.setItem(KEYS.game, JSON.stringify(stored));

    expect(await loadSudoku(catalog)).toEqual({ game: null, playHistory: HISTORY });
  });

  it("is ignored when it isn't JSON", async () => {
    await AsyncStorage.setItem(KEYS.game, '{"puzzleId": "sudoku-9x9-001-0001", "cel');
    expect((await loadSudoku(catalog)).game).toBeNull();
  });
});

describe('play history', () => {
  it('comes back as it was saved', async () => {
    await savePlayHistory(HISTORY);
    expect((await loadSudoku(catalog)).playHistory).toEqual(HISTORY);
  });

  it('starts empty when the saved one is unreadable', async () => {
    await AsyncStorage.setItem(KEYS.playHistory, JSON.stringify({ solved: 'all of them' }));
    expect((await loadSudoku(catalog)).playHistory).toEqual(EMPTY_HISTORY);
  });

  it('loads a Phase 1 play history, which has no abandons, with none', async () => {
    const phase1 = { solved: HISTORY.solved, lastServed: HISTORY.lastServed };
    await AsyncStorage.setItem(KEYS.playHistory, JSON.stringify(phase1));
    expect((await loadSudoku(catalog)).playHistory).toEqual({ ...phase1, abandonedAt: {} });
  });

  it('keeps the rest of the history when its abandons are unreadable', async () => {
    for (const abandonedAt of [['sudoku-6x6-001-0001'], { 'sudoku-6x6-001-0001': 'yesterday' }]) {
      await AsyncStorage.setItem(KEYS.playHistory, JSON.stringify({ ...HISTORY, abandonedAt }));
      expect((await loadSudoku(catalog)).playHistory).toEqual({ ...HISTORY, abandonedAt: {} });
    }
  });
});

describe('results log', () => {
  it('is empty before the first solve', async () => {
    expect(await loadResults()).toEqual([]);
  });

  it('keeps every entry, in order, when two are appended back to back', async () => {
    const second = { ...SOLVE, puzzleId: 'sudoku-6x6-001-0001', size: 6 as const };
    void appendResult(SOLVE);
    void appendResult(second);
    expect(await loadResults()).toEqual([SOLVE, second]);
  });

  it('keeps abandons as well as solves', async () => {
    void appendResult(SOLVE);
    void appendResult(ABANDON);
    expect(await loadResults()).toEqual([SOLVE, ABANDON]);
  });

  it('still reads a log written by Phase 1', async () => {
    await AsyncStorage.setItem(KEYS.results, JSON.stringify([SOLVE]));
    await appendResult(ABANDON);
    expect(await loadResults()).toEqual([SOLVE, ABANDON]);
  });

  it("keeps entries it can't read when it appends", async () => {
    const later = { ...SOLVE, outcome: 'timedOut' }; // an outcome this version doesn't know
    await AsyncStorage.setItem(KEYS.results, JSON.stringify([later]));
    await appendResult(SOLVE);

    expect(JSON.parse((await AsyncStorage.getItem(KEYS.results)) ?? 'null')).toEqual([
      later,
      SOLVE,
    ]);
    expect(await loadResults()).toEqual([SOLVE]);
  });
});

describe('storage', () => {
  it('keeps every key under v1:', async () => {
    await saveGame(playedGame(firstPuzzle(9)), 0);
    await savePlayHistory(HISTORY);
    await appendResult(SOLVE);

    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toHaveLength(3);
    expect(keys.every((key) => key.startsWith('v1:'))).toBe(true);
  });

  it('warns about a failed write instead of throwing, and keeps saving', async () => {
    const game = playedGame(firstPuzzle(9));
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('Disk full'));

    await expect(saveGame(game, 1_000)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    await saveGame(game, 2_000);
    expect((await loadSudoku(catalog)).game?.elapsedMs).toBe(2_000);
  });

  it("starts fresh when storage can't be read", async () => {
    await saveGame(playedGame(firstPuzzle(9)), 0);
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('Locked'));

    expect(await loadSudoku(catalog)).toEqual({ game: null, playHistory: EMPTY_HISTORY });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
