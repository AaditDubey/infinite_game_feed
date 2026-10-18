import { create } from 'zustand';

import { tapForMistake } from '@/haptics/haptics';
import {
  EMPTY_HISTORY,
  loadBundledCatalog,
  markSolved,
  pickNextPuzzle,
  type PlayHistory,
} from '@/puzzles/loader';
import * as stopwatch from '@/timer/stopwatch';

import * as engine from './engine';
import type { Band, Digit, GameState } from './types';

// The Sudoku screen's state. Moves go through the engine; the store adds selection, Notes,
// the timer, the chosen band and which puzzles have been played.
interface SudokuStore {
  band: Band;
  history: PlayHistory; // kept in memory until Task 9 saves it
  game: GameState;
  timer: stopwatch.Stopwatch;
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
  nextPuzzle: () => void;
  chooseBand: (band: Band) => void;
  pauseTimer: () => void; // the app went to the background; there's no pause button
  resumeTimer: () => void; // the app came back
}

const catalog = loadBundledCatalog();

// Serves the next puzzle in `band` and starts its timer from zero.
function servePuzzle(band: Band, history: PlayHistory) {
  const next = pickNextPuzzle(catalog, band, history, Math.random);
  return {
    band,
    history: next.history,
    game: engine.createGame(next.puzzle),
    timer: stopwatch.start(Date.now()),
    selected: null,
    notesMode: false,
  };
}

export const useSudokuStore = create<SudokuStore>()((set, get) => {
  // The engine returns the same game for a move it ignores; skipping `set` then means
  // nothing re-renders.
  const apply = (next: GameState) => {
    if (next !== get().game) {
      set({ game: next });
    }
  };

  // A new puzzle clears the flash but keeps counting ids, so the next flash always plays.
  const startPuzzle = (band: Band) => {
    const { history, flash } = get();
    set({ ...servePuzzle(band, history), flash: { cells: [], id: flash.id } });
  };

  return {
    ...servePuzzle(1, EMPTY_HISTORY),
    flash: { cells: [], id: 0 },
    select: (index) => set({ selected: index }),
    inputDigit: (digit) => {
      const { game, selected, notesMode, flash, timer, history } = get();
      if (selected === null) {
        return;
      }
      const move = notesMode ? engine.toggleNote : engine.placeDigit;
      const next = move(game, selected, digit);
      if (next === game) {
        return;
      }
      if (next.mistakes > game.mistakes) {
        tapForMistake();
      }
      const update: Partial<SudokuStore> = { game: next };
      const completed = engine.completedUnits(next, selected);
      if (completed.length > 0) {
        update.flash = { cells: completed.flat(), id: flash.id + 1 };
      }
      if (next.solved) {
        update.timer = stopwatch.pause(timer, Date.now());
        update.history = markSolved(history, next.puzzle.id);
      }
      set(update);
    },
    eraseSelected: () => {
      const { game, selected } = get();
      if (selected !== null) {
        apply(engine.erase(game, selected));
      }
    },
    undo: () => apply(engine.undo(get().game)),
    toggleNotesMode: () => set((state) => ({ notesMode: !state.notesMode })),
    nextPuzzle: () => startPuzzle(get().band),
    chooseBand: (band) => {
      if (band !== get().band) {
        startPuzzle(band);
      }
    },
    pauseTimer: () => set({ timer: stopwatch.pause(get().timer, Date.now()) }),
    resumeTimer: () => {
      const { game, timer } = get();
      if (!game.solved) {
        set({ timer: stopwatch.resume(timer, Date.now()) });
      }
    },
  };
});
