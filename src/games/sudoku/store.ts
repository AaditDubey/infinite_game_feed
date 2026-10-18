import { create } from 'zustand';

import { EMPTY_HISTORY, loadBundledCatalog, pickNextPuzzle } from '@/puzzles/loader';

import * as engine from './engine';
import type { Digit, GameState } from './types';

// The Sudoku screen's state. Moves go through the engine; the store adds selection and Notes.
interface SudokuStore {
  game: GameState;
  selected: number | null; // index of the selected cell
  notesMode: boolean;
  // Cells of the rows, columns and boxes the last digit completed. `id` goes up with each
  // completion, so the board can replay the flash on the same cells.
  flash: { cells: number[]; id: number };
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
    flash: { cells: [], id: 0 },
    select: (index) => set({ selected: index }),
    inputDigit: (digit) => {
      const { game, selected, notesMode, flash } = get();
      if (selected === null) {
        return;
      }
      const move = notesMode ? engine.toggleNote : engine.placeDigit;
      const next = move(game, selected, digit);
      if (next === game) {
        return;
      }
      const completed = engine.completedUnits(next, selected);
      if (completed.length === 0) {
        set({ game: next });
      } else {
        set({ game: next, flash: { cells: completed.flat(), id: flash.id + 1 } });
      }
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
