import { create, type StoreApi } from 'zustand';

import { loadSudoku } from '@/storage/persistence';

import { createGame } from './engine';
import * as source from './source';
import { createSudokuStore, type SudokuState } from './store';
import type { Band } from './types';

// Phase 1's single puzzle screen, on top of Phase 2's one store per puzzle: it holds the puzzle
// on screen and swaps in a new store for Next puzzle or a band change. Temporary: the feed
// store takes over these jobs in Phase 2's Task 6, and this file goes.
interface SudokuSession {
  page: StoreApi<SudokuState> | null; // the puzzle on screen; null until restore() has run
  restore: () => Promise<void>; // on launch: resumes the saved game or serves a new one
  nextPuzzle: () => void;
  chooseBand: (band: Band) => void; // for testing; the feed's difficulty mix replaces it
}

// A new puzzle from `band`, with its timer running from zero.
function servePuzzle(band: Band): StoreApi<SudokuState> {
  return createSudokuStore({ game: createGame(source.pick(band, Math.random)), elapsedMs: 0 });
}

export const useSudokuSession = create<SudokuSession>()((set, get) => {
  // The old puzzle's store is dropped, not saved again: the new game takes its place in storage.
  const show = (page: StoreApi<SudokuState>) => {
    page.getState().activate(Date.now());
    set({ page });
  };
  const currentBand = () => get().page?.getState().game.puzzle.band;

  return {
    page: null,
    restore: async () => {
      if (get().page !== null) {
        return;
      }
      const saved = await loadSudoku(source.catalog);
      // Another call may have finished first; the player could already be playing.
      if (get().page !== null) {
        return;
      }
      source.load(saved.playHistory);
      if (saved.game !== null && !saved.game.state.solved) {
        // Carries on from the saved play time.
        show(createSudokuStore({ game: saved.game.state, elapsedMs: saved.game.elapsedMs }));
      } else {
        // A solved game isn't resumed: the next puzzle of its band is served instead.
        show(servePuzzle(saved.game?.state.puzzle.band ?? 1));
      }
    },
    nextPuzzle: () => {
      const band = currentBand();
      if (band !== undefined) {
        show(servePuzzle(band));
      }
    },
    chooseBand: (band) => {
      if (get().page !== null && band !== currentBand()) {
        show(servePuzzle(band));
      }
    },
  };
});
