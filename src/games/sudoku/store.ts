import { create } from 'zustand';

import { EMPTY_HISTORY, loadBundledCatalog, pickNextPuzzle } from '@/puzzles/loader';

import * as engine from './engine';
import type { Digit, GameState } from './types';

// The Sudoku screen's state. Moves go through the engine; the store adds selection and Notes.
interface SudokuStore {
  game: GameState;
  selected: number | null; // index of the selected cell
  notesMode: boolean;
  select: (index: number) => void;
  inputDigit: (digit: Digit) => void;
  eraseSelected: () => void;
  undo: () => void;
  toggleNotesMode: () => void;
}

// Until Task 8 adds Next puzzle and the band picker, the screen opens on a band 1 puzzle.
function firstGame(): GameState {
  const { puzzle } = pickNextPuzzle(loadBundledCatalog(), 1, EMPTY_HISTORY, Math.random);
  return engine.createGame(puzzle);
}

export const useSudokuStore = create<SudokuStore>()((set, get) => {
  // The engine returns the same game for a move it ignores; skipping `set` then means
  // nothing re-renders.
  const apply = (next: GameState) => {
    if (next !== get().game) {
      set({ game: next });
    }
  };

  return {
    game: firstGame(),
    selected: null,
    notesMode: false,
    select: (index) => set({ selected: index }),
    inputDigit: (digit) => {
      const { game, selected, notesMode } = get();
      if (selected === null) {
        return;
      }
      const move = notesMode ? engine.toggleNote : engine.placeDigit;
      apply(move(game, selected, digit));
    },
    eraseSelected: () => {
      const { game, selected } = get();
      if (selected !== null) {
        apply(engine.erase(game, selected));
      }
    },
    undo: () => apply(engine.undo(get().game)),
    toggleNotesMode: () => set((state) => ({ notesMode: !state.notesMode })),
  };
});
