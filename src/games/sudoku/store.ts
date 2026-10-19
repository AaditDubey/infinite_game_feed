import { createStore, type StoreApi } from 'zustand';

import { tapForMistake } from '@/haptics/haptics';
import { appendResult, saveGame } from '@/storage/persistence';
import * as stopwatch from '@/timer/stopwatch';

import * as engine from './engine';
import * as source from './source';
import type { Digit, GameState } from './types';

// One puzzle's state. Moves go through the engine; the store adds selection, Notes and the
// timer, and saves the game. Each puzzle gets its own store, so the feed can show two boards
// at once and a tap re-renders only its own puzzle.
export interface SudokuState {
  game: GameState;
  timer: stopwatch.Stopwatch;
  selected: number | null; // index of the selected cell
  notesMode: boolean;
  // Cells of the rows, columns and boxes the last digit completed. `id` goes up with each
  // completion, so the board can replay the flash on the same cells.
  flash: { cells: number[]; id: number };
  // From the solving move until the puzzle is left, so the swipe label shows only at the moment
  // of solving. A restored game never sets it.
  justSolved: boolean;
  select: (index: number) => void;
  inputDigit: (digit: Digit) => void;
  eraseSelected: () => void;
  undo: () => void;
  toggleNotesMode: () => void;
  activate: (now: number) => void; // the puzzle is on screen, or the app came back
  deactivate: (now: number) => void; // the puzzle was left, or the app went to the background
  saveNow: () => void; // saves the play time so far, without pausing
}

export interface SudokuInit {
  game: GameState; // fresh from createGame, or restored from its save
  elapsedMs: number; // play time so far
}

// The timer starts paused at `elapsedMs`. It runs once activate() puts the puzzle on screen.
export function createSudokuStore({ game, elapsedMs }: SudokuInit): StoreApi<SudokuState> {
  const store = createStore<SudokuState>()((set, get) => {
    // The engine returns the same game for a move it ignores; skipping `set` then means
    // nothing re-renders.
    const apply = (next: GameState) => {
      if (next !== get().game) {
        set({ game: next });
      }
    };

    return {
      game,
      timer: { elapsedMs, runningSince: null },
      selected: null,
      notesMode: false,
      flash: { cells: [], id: 0 },
      justSolved: false,
      select: (index) => set({ selected: index }),
      inputDigit: (digit) => {
        const { game, selected, notesMode, flash, timer } = get();
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
        const update: Partial<SudokuState> = { game: next };
        const completed = engine.completedUnits(next, selected);
        if (completed.length > 0) {
          update.flash = { cells: completed.flat(), id: flash.id + 1 };
        }
        if (next.solved) {
          const now = Date.now();
          const stopped = stopwatch.pause(timer, now);
          update.timer = stopped;
          update.justSolved = true;
          source.markSolved(next.puzzle.id);
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
      activate: (now) => {
        const { game, timer } = get();
        if (!game.solved) {
          set({ timer: stopwatch.resume(timer, now) });
        }
      },
      deactivate: (now) => set({ timer: stopwatch.pause(get().timer, now), justSolved: false }),
      saveNow: () => save(get()),
    };
  });

  // Saves the game after every move and whenever the timer stops, starts or restarts, so
  // closing the app loses nothing.
  store.subscribe((state, prev) => {
    if (state.game !== prev.game || state.timer !== prev.timer) {
      save(state);
    }
  });

  return store;
}

// Saves the game with the play time so far.
function save({ game, timer }: Pick<SudokuState, 'game' | 'timer'>) {
  void saveGame(game, stopwatch.elapsedMs(timer, Date.now()));
}
