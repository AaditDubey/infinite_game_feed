import type { StoreApi } from 'zustand';

import { createGame } from '@/games/sudoku/engine';
import * as sudoku from '@/games/sudoku/source';
import { createSudokuStore, type SudokuState } from '@/games/sudoku/store';
import { loadSudoku } from '@/storage/persistence';

import type { Band } from './difficulty';
import type { GameKind } from './feed';

// The one place the feed meets the games: everything else under src/feed/ knows nothing about
// Sudoku. Phase 3 adds Rectangles and Queens here.

// One page's game store. Every game's store has activate, deactivate, saveNow and abandon,
// which the feed calls. Phase 3 makes this a union of each game's store.
export type GameStore = StoreApi<SudokuState>;

export interface Game {
  // Reads what the game saved for picking puzzles. Runs once at launch, before the first pick.
  load: () => Promise<void>;
  // A new page's puzzle from `band`, which counts as served from now on, and the page's store,
  // with its timer paused until the page is seen. `random` is like Math.random.
  serve: (band: Band, random: () => number) => { puzzleId: string; store: GameStore };
}

export const GAMES: Record<GameKind, Game> = {
  sudoku: {
    load: async () => {
      const { playHistory } = await loadSudoku(sudoku.catalog);
      sudoku.load(playHistory);
    },
    serve: (band, random) => {
      const puzzle = sudoku.pick(band, random);
      return {
        puzzleId: puzzle.id,
        store: createSudokuStore({ game: createGame(puzzle), elapsedMs: 0 }),
      };
    },
  },
};
