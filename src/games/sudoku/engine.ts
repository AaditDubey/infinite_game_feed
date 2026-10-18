import {
  BOX_SHAPES,
  DIGITS,
  type CellChange,
  type CellState,
  type Digit,
  type GameState,
  type GridSize,
  type Puzzle,
} from './types';

// Every rule of the game, as pure functions. A move that changes nothing returns the same state.

// How the board shows a cell, given the selected cell.
export type Highlight = 'selected' | 'sameDigit' | 'peer' | 'none';

export function createGame(puzzle: Puzzle): GameState {
  const cells = [...puzzle.givens].map((char): CellState => {
    const value = char === '0' ? null : toDigit(char);
    return { value, given: value !== null, notes: [], wrong: false };
  });
  return { puzzle, cells, mistakes: 0, history: [], solved: false };
}

// Givens and correct digits are locked. A wrong digit counts a mistake; a correct one also
// removes that digit from the notes in its row, column and box, and can't be undone.
export function placeDigit(state: GameState, index: number, digit: Digit): GameState {
  checkIndex(state, index);
  checkDigit(state, digit);
  if (state.solved || isLocked(state, index) || state.cells[index].value === digit) {
    return state;
  }
  const correct = digit === solutionDigit(state, index);
  const changes = new Map<number, CellState>();
  changes.set(index, { value: digit, given: false, notes: [], wrong: !correct });
  if (correct) {
    state.cells.forEach((cell, other) => {
      if (cell.notes.includes(digit) && isPeer(state.puzzle.size, index, other)) {
        changes.set(other, { ...cell, notes: cell.notes.filter((note) => note !== digit) });
      }
    });
  }
  const next = applyMove(state, changes, correct ? state.mistakes : state.mistakes + 1);
  // A correct digit is permanent, so undo never goes back past it.
  return correct ? { ...next, history: [] } : next;
}

// Only empty cells take notes.
export function toggleNote(state: GameState, index: number, digit: Digit): GameState {
  checkIndex(state, index);
  checkDigit(state, digit);
  const cell = state.cells[index];
  if (state.solved || cell.value !== null) {
    return state;
  }
  const notes = cell.notes.includes(digit)
    ? cell.notes.filter((note) => note !== digit)
    : [...cell.notes, digit].sort((a, b) => a - b);
  return applyMove(state, new Map([[index, { ...cell, notes }]]), state.mistakes);
}

export function erase(state: GameState, index: number): GameState {
  checkIndex(state, index);
  const cell = state.cells[index];
  if (state.solved || isLocked(state, index) || (cell.value === null && cell.notes.length === 0)) {
    return state;
  }
  const empty: CellState = { value: null, given: false, notes: [], wrong: false };
  return applyMove(state, new Map([[index, empty]]), state.mistakes);
}

// Puts back the cells the last move changed. Mistakes stay counted.
export function undo(state: GameState): GameState {
  if (state.solved || state.history.length === 0) {
    return state;
  }
  const cells = [...state.cells];
  for (const { index, before } of state.history[state.history.length - 1]) {
    cells[index] = before;
  }
  return { ...state, cells, history: state.history.slice(0, -1) };
}

export function isSolved(state: GameState): boolean {
  return state.cells.every((cell, index) => cell.value === solutionDigit(state, index));
}

// Same digit wins over peer, so a clashing digit in the selected cell's row still stands out.
export function highlights(state: GameState, selected: number | null): Highlight[] {
  if (selected === null) {
    return state.cells.map(() => 'none');
  }
  checkIndex(state, selected);
  const digit = state.cells[selected].value;
  return state.cells.map((cell, index): Highlight => {
    if (index === selected) return 'selected';
    if (digit !== null && cell.value === digit) return 'sameDigit';
    if (isPeer(state.puzzle.size, selected, index)) return 'peer';
    return 'none';
  });
}

// The row, column and box through `index` that have every digit correct, in that order, as
// lists of cell indices. Correct digits are permanent, so each unit completes only once: on
// the move that places its last digit.
export function completedUnits(state: GameState, index: number): number[][] {
  checkIndex(state, index);
  return unitsThrough(state.puzzle.size, index).filter((unit) =>
    unit.every((cell) => isLocked(state, cell)),
  );
}

// Digits with every copy placed correctly, so the number pad can dim them.
export function completedDigits(state: GameState): Digit[] {
  const size = state.puzzle.size;
  return DIGITS.slice(0, size).filter(
    (digit) =>
      state.cells.filter((cell, index) => cell.value === digit && isLocked(state, index)).length ===
      size,
  );
}

// Swaps in the changed cells and records how they were, as one undo step.
function applyMove(state: GameState, changes: Map<number, CellState>, mistakes: number): GameState {
  const cells = [...state.cells];
  const step: CellChange[] = [];
  changes.forEach((cell, index) => {
    step.push({ index, before: state.cells[index] });
    cells[index] = cell;
  });
  const next = { ...state, cells, mistakes, history: [...state.history, step] };
  return { ...next, solved: isSolved(next) };
}

// A given or a correct digit: its cell already holds the solution.
function isLocked(state: GameState, index: number): boolean {
  return state.cells[index].value === solutionDigit(state, index);
}

function solutionDigit(state: GameState, index: number): Digit {
  return toDigit(state.puzzle.solution[index]);
}

function toDigit(char: string): Digit {
  return Number(char) as Digit; // the loader checked every digit is 1 to the grid size
}

// The row, column and box through `index`, each as cell indices in reading order.
function unitsThrough(size: GridSize, index: number): number[][] {
  const { boxWidth, boxHeight } = BOX_SHAPES[size];
  const row = Math.floor(index / size);
  const col = index % size;
  const top = row - (row % boxHeight);
  const left = col - (col % boxWidth);
  const range = (length: number) => Array.from({ length }, (_, i) => i);
  return [
    range(size).map((c) => row * size + c),
    range(size).map((r) => r * size + col),
    range(boxHeight).flatMap((r) => range(boxWidth).map((c) => (top + r) * size + left + c)),
  ];
}

// Two different cells in the same row, column or box.
function isPeer(size: GridSize, a: number, b: number): boolean {
  const { boxWidth, boxHeight } = BOX_SHAPES[size];
  const rowA = Math.floor(a / size);
  const rowB = Math.floor(b / size);
  const colA = a % size;
  const colB = b % size;
  const sameBox =
    Math.floor(rowA / boxHeight) === Math.floor(rowB / boxHeight) &&
    Math.floor(colA / boxWidth) === Math.floor(colB / boxWidth);
  return a !== b && (rowA === rowB || colA === colB || sameBox);
}

function checkIndex(state: GameState, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= state.cells.length) {
    throw new RangeError(
      `Cell ${index} is off the ${state.puzzle.size}×${state.puzzle.size} board`,
    );
  }
}

function checkDigit(state: GameState, digit: Digit) {
  if (!Number.isInteger(digit) || digit < 1 || digit > state.puzzle.size) {
    throw new RangeError(`Digit ${digit} is not 1 to ${state.puzzle.size}`);
  }
}
