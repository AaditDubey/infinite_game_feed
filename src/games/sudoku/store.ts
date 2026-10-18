import { create } from 'zustand';

import { tapForMistake } from '@/haptics/haptics';
import {
  EMPTY_HISTORY,
  loadBundledCatalog,
  markSolved,
  pickNextPuzzle,
  type PlayHistory,
} from '@/puzzles/loader';
import { appendResult, loadSudoku, saveGame, savePlayHistory } from '@/storage/persistence';
import * as stopwatch from '@/timer/stopwatch';

import * as engine from './engine';
import type { Band, Digit, GameState } from './types';

// The Sudoku screen's state. Moves go through the engine; the store adds selection, Notes,
// the timer, the chosen band and which puzzles have been played, and saves them all.
interface SudokuStore {
  ready: boolean; // false until restore() has loaded the saved game
  band: Band;
  history: PlayHistory;
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
  saveNow: () => void; // saves the play time so far, without pausing
  restore: () => Promise<void>; // on launch: resumes the saved game or serves a new one
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
    // A placeholder until restore() replaces it. Nothing is shown or saved before then.
    ...servePuzzle(1, EMPTY_HISTORY),
    ready: false,
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
        const now = Date.now();
        const stopped = stopwatch.pause(timer, now);
        update.timer = stopped;
        update.history = markSolved(history, next.puzzle.id);
        void appendResult({
          outcome: 'solved',
          puzzleId: next.puzzle.id,
          size: next.puzzle.size,
          band: next.puzzle.band,
          at: now,
          elapsedMs: stopped.elapsedMs,
          mistakes: next.mistakes,
        });
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
    saveNow: () => {
      if (get().ready) {
        saveProgress(get());
      }
    },
    restore: async () => {
      if (get().ready) {
        return;
      }
      const saved = await loadSudoku(catalog);
      // Another call may have finished first; the player could already be playing.
      if (get().ready) {
        return;
      }
      if (saved.game !== null && !saved.game.state.solved) {
        const { state, elapsedMs } = saved.game;
        set({
          ready: true,
          band: state.puzzle.band,
          history: saved.playHistory,
          game: state,
          // Carries on from the saved play time.
          timer: stopwatch.resume({ elapsedMs, runningSince: null }, Date.now()),
        });
      } else {
        // A solved game isn't resumed: the next puzzle of its band is served instead.
        const band = saved.game?.state.puzzle.band ?? 1;
        set({ ...servePuzzle(band, saved.playHistory), ready: true });
      }
    },
  };
});

// Saves the game with the play time so far.
function saveProgress({ game, timer }: Pick<SudokuStore, 'game' | 'timer'>) {
  void saveGame(game, stopwatch.elapsedMs(timer, Date.now()));
}

// Saves the game after every move and whenever the timer stops, starts or restarts, and the
// play history whenever it changes, so closing the app loses nothing.
useSudokuStore.subscribe((state, prev) => {
  if (!state.ready) {
    return;
  }
  if (state.game !== prev.game || state.timer !== prev.timer) {
    saveProgress(state);
  }
  if (state.history !== prev.history) {
    void savePlayHistory(state.history);
  }
});
