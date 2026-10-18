import { loadBundledCatalog } from '@/puzzles/loader';

import { createGame } from './engine';
import { useSudokuStore } from './store';
import type { Digit, GameState } from './types';

// The first band 1 puzzle in the 9×9 pack, so every run uses the same board.
const PUZZLE = loadBundledCatalog()[0];

function answer(game: GameState, index: number): Digit {
  return Number(game.puzzle.solution[index]) as Digit; // solution chars are 1 to size
}

const store = () => useSudokuStore.getState();
const start = createGame(PUZZLE);
const empty = start.cells.findIndex((cell) => cell.value === null);
const given = start.cells.findIndex((cell) => cell.given);

beforeEach(() => {
  useSudokuStore.setState({ game: start, selected: null, notesMode: false });
});

describe('useSudokuStore', () => {
  it('opens on a band 1 puzzle', () => {
    expect(useSudokuStore.getInitialState().game.puzzle.band).toBe(1);
  });

  it('ignores digits until a cell is selected', () => {
    store().inputDigit(answer(start, empty));
    expect(store().game).toBe(start);
  });

  it('places a digit in the selected cell', () => {
    store().select(empty);
    store().inputDigit(answer(start, empty));
    expect(store().game.cells[empty].value).toBe(answer(start, empty));
  });

  it('toggles a note instead while Notes is on', () => {
    store().select(empty);
    store().toggleNotesMode();
    store().inputDigit(1);
    expect(store().game.cells[empty]).toMatchObject({ value: null, notes: [1] });
    store().toggleNotesMode();
    expect(store().notesMode).toBe(false);
  });

  it('erases the selected cell', () => {
    store().select(empty);
    store().toggleNotesMode();
    store().inputDigit(1);
    store().eraseSelected();
    expect(store().game.cells[empty].notes).toEqual([]);
  });

  it('undoes the last move', () => {
    store().select(empty);
    store().inputDigit(answer(start, empty) === 1 ? 2 : 1);
    store().undo();
    expect(store().game.cells).toEqual(start.cells);
  });

  it("doesn't update when the engine ignores a move", () => {
    store().select(given);
    const listener = jest.fn();
    const unsubscribe = useSudokuStore.subscribe(listener);
    store().inputDigit(1);
    store().eraseSelected();
    store().undo();
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
    expect(store().game).toBe(start);
  });
});
