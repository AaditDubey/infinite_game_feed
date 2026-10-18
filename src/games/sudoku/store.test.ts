import { loadBundledCatalog } from '@/puzzles/loader';

import { createGame, placeDigit } from './engine';
import { useSudokuStore } from './store';
import type { Digit, GameState } from './types';

// The first band 1 puzzle in the 9×9 pack, so every run uses the same board.
const PUZZLE = loadBundledCatalog()[0];

function answer(game: GameState, index: number): Digit {
  return Number(game.puzzle.solution[index]) as Digit; // solution chars are 1 to size
}

const store = () => useSudokuStore.getState();
const start = createGame(PUZZLE);
const [empty, otherEmpty] = start.cells.flatMap((cell, index) =>
  cell.value === null ? [index] : [],
);
const given = start.cells.findIndex((cell) => cell.given);

beforeEach(() => {
  useSudokuStore.setState({
    game: start,
    selected: null,
    notesMode: false,
    flash: { cells: [], id: 0 },
  });
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

  it('flashes the cells of a row that a correct digit completes', () => {
    const row = Array.from({ length: 9 }, (_, col) => Math.floor(empty / 9) * 9 + col);
    const others = row.filter((index) => index !== empty && start.cells[index].value === null);
    const game = others.reduce(
      (state, index) => placeDigit(state, index, answer(state, index)),
      start,
    );
    useSudokuStore.setState({ game, flash: { cells: [], id: 4 } });

    store().select(empty);
    store().inputDigit(answer(start, empty));
    expect(store().flash.id).toBe(5);
    expect(store().flash.cells).toEqual(expect.arrayContaining(row));
  });

  it("doesn't flash for a note or a digit that completes nothing", () => {
    const flash = store().flash;
    store().select(empty);
    store().inputDigit(answer(start, empty));
    store().select(otherEmpty);
    store().toggleNotesMode();
    store().inputDigit(1);
    expect(store().game.cells[otherEmpty].notes).toEqual([1]);
    expect(store().flash).toBe(flash);
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
