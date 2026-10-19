import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  Band,
  CellChange,
  CellState,
  GameState,
  GridSize,
  Puzzle,
} from '@/games/sudoku/types';
import { EMPTY_HISTORY, type PlayHistory } from '@/puzzles/loader';

// Every key starts with `v1:`, so a later format can use new keys instead of misreading these.
export const KEYS = {
  game: 'v1:sudoku:game',
  playHistory: 'v1:sudoku:playHistory',
  results: 'v1:sudoku:results',
} as const;

// One entry in the results log. From Phase 2 a swipe past an unsolved puzzle logs 'abandoned'.
export interface ResultEntry {
  outcome: 'solved';
  puzzleId: string;
  size: GridSize;
  band: Band;
  at: number; // when it happened, in ms since 1970, like Date.now()
  elapsedMs: number;
  mistakes: number;
}

// The game as stored. The puzzle is saved by id, because the packs ship with the app.
interface StoredGame {
  puzzleId: string;
  cells: CellState[];
  mistakes: number;
  history: CellChange[][];
  solved: boolean;
  elapsedMs: number;
}

export interface SavedSudoku {
  game: { state: GameState; elapsedMs: number } | null; // null when nothing usable was saved
  playHistory: PlayHistory;
}

// Writes run one at a time, in the order they were made. Without this, two results appended
// close together could both read the old log, and the second write would drop the first entry.
// A failed write is logged and skipped: losing one save is better than interrupting play.
let queue: Promise<void> = Promise.resolve();

function enqueue(what: string, write: () => Promise<void>): Promise<void> {
  queue = queue
    .then(write)
    .catch((error: unknown) => console.warn(`Could not save ${what}`, error));
  return queue;
}

// Loads what the last session saved. Anything missing or unreadable is left out, so a bad save
// starts a fresh game instead of stopping the app from opening.
export async function loadSudoku(catalog: readonly Puzzle[]): Promise<SavedSudoku> {
  try {
    const [game, playHistory] = await Promise.all([
      AsyncStorage.getItem(KEYS.game),
      AsyncStorage.getItem(KEYS.playHistory),
    ]);
    return {
      game: parseGame(parseJson(game), catalog),
      playHistory: parsePlayHistory(parseJson(playHistory)),
    };
  } catch (error) {
    console.warn('Could not load the saved game', error);
    return { game: null, playHistory: EMPTY_HISTORY };
  }
}

export function saveGame(game: GameState, elapsedMs: number): Promise<void> {
  const stored: StoredGame = {
    puzzleId: game.puzzle.id,
    cells: game.cells,
    mistakes: game.mistakes,
    history: game.history,
    solved: game.solved,
    elapsedMs,
  };
  const text = JSON.stringify(stored);
  return enqueue('the game', () => AsyncStorage.setItem(KEYS.game, text));
}

export function savePlayHistory(history: PlayHistory): Promise<void> {
  const text = JSON.stringify(history);
  return enqueue('the play history', () => AsyncStorage.setItem(KEYS.playHistory, text));
}

// Entries already in the log are kept as they are, even ones this version can't read.
export function appendResult(entry: ResultEntry): Promise<void> {
  if (__DEV__) {
    console.log('Results log:', JSON.stringify(entry)); // shows in the `npx expo start` terminal
  }
  return enqueue('the result', async () => {
    const log = parseJson(await AsyncStorage.getItem(KEYS.results));
    const entries: unknown[] = Array.isArray(log) ? log : [];
    await AsyncStorage.setItem(KEYS.results, JSON.stringify([...entries, entry]));
  });
}

// The app doesn't read the log in Phase 1; Phase 3's rating will. Waits for pending writes first.
export async function loadResults(): Promise<ResultEntry[]> {
  await queue;
  const log = parseJson(await AsyncStorage.getItem(KEYS.results));
  return Array.isArray(log) ? log.filter(isResultEntry) : [];
}

function parseJson(text: string | null): unknown {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// A saved game is used only if it still fits its puzzle: the right number of cells, the same
// givens, and every digit and wrong flag consistent with the solution.
function parseGame(raw: unknown, catalog: readonly Puzzle[]): SavedSudoku['game'] {
  if (!isRecord(raw)) {
    return null;
  }
  const puzzle = catalog.find(({ id }) => id === raw.puzzleId);
  if (puzzle === undefined) {
    return null;
  }
  const { cells, mistakes, history, solved, elapsedMs } = raw;
  const isCellAt = (cell: unknown, index: number): cell is CellState => isCell(cell, puzzle, index);
  // isCell turns down an index that's off the board.
  const isChange = (change: unknown): change is CellChange =>
    isRecord(change) && typeof change.index === 'number' && isCellAt(change.before, change.index);
  const isStep = (step: unknown): step is CellChange[] =>
    Array.isArray(step) && step.every(isChange);
  if (
    !Array.isArray(cells) ||
    cells.length !== puzzle.givens.length ||
    !cells.every(isCellAt) ||
    !Array.isArray(history) ||
    !history.every(isStep) ||
    !isWholeNumber(mistakes) ||
    !isWholeNumber(elapsedMs) ||
    typeof solved !== 'boolean'
  ) {
    return null;
  }
  return { state: { puzzle, cells, mistakes, history, solved }, elapsedMs };
}

function isCell(raw: unknown, puzzle: Puzzle, index: number): raw is CellState {
  const given = puzzle.givens[index];
  const answer = puzzle.solution[index];
  if (!isRecord(raw) || given === undefined || answer === undefined) {
    return false;
  }
  const { value, notes, wrong } = raw;
  const isDigit = (digit: unknown): digit is number =>
    isWholeNumber(digit) && digit >= 1 && digit <= puzzle.size;
  return (
    (value === null || isDigit(value)) &&
    raw.given === (given !== '0') &&
    (given === '0' || value === Number(given)) &&
    wrong === (value !== null && value !== Number(answer)) &&
    Array.isArray(notes) &&
    notes.every((note, i) => isDigit(note) && (i === 0 || note > notes[i - 1]))
  );
}

function parsePlayHistory(raw: unknown): PlayHistory {
  if (isRecord(raw) && isStringArray(raw.solved) && isStringArray(raw.lastServed)) {
    return { solved: raw.solved, lastServed: raw.lastServed };
  }
  return EMPTY_HISTORY;
}

function isResultEntry(raw: unknown): raw is ResultEntry {
  return (
    isRecord(raw) &&
    raw.outcome === 'solved' &&
    typeof raw.puzzleId === 'string' &&
    (raw.size === 6 || raw.size === 9) &&
    isWholeNumber(raw.band) &&
    raw.band >= 1 &&
    raw.band <= 5 &&
    isWholeNumber(raw.at) &&
    isWholeNumber(raw.elapsedMs) &&
    isWholeNumber(raw.mistakes)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
