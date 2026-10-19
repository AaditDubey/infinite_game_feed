import {
  EMPTY_HISTORY,
  loadBundledCatalog,
  markSolved as recordSolve,
  pickNextPuzzle,
  type PlayHistory,
} from '@/puzzles/loader';
import { savePlayHistory } from '@/storage/persistence';

import type { Band, Puzzle } from './types';

// Where Sudoku puzzles come from: every puzzle shipped with the app, and the play history that
// decides which one is served next. There's one of each for the whole app, however many
// puzzles are on screen.

export const catalog: readonly Puzzle[] = loadBundledCatalog();

let history: PlayHistory = EMPTY_HISTORY;

// Called once at launch with the play history read from storage, before any puzzle is picked.
export function load(saved: PlayHistory): void {
  history = saved;
}

// The next puzzle in `band`, by the no-repeat rule. It counts as served from now on, so the
// play history is saved. `random` returns a number in [0, 1), like Math.random.
export function pick(band: Band, random: () => number): Puzzle {
  const next = pickNextPuzzle(catalog, band, history, random);
  history = next.history;
  void savePlayHistory(history);
  return next.puzzle;
}

// A solved puzzle counts as played, so it isn't served again until its band starts over.
export function markSolved(puzzleId: string): void {
  const next = recordSolve(history, puzzleId);
  if (next !== history) {
    history = next;
    void savePlayHistory(history);
  }
}

export function find(puzzleId: string): Puzzle | undefined {
  return catalog.find(({ id }) => id === puzzleId);
}
