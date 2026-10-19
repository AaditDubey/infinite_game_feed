import pack6x6 from '@/assets/puzzles/sudoku/pack-6x6-001.json';
import pack9x9 from '@/assets/puzzles/sudoku/pack-9x9-001.json';
import { BOX_SHAPES, type Band, type GridSize, type Puzzle } from '@/games/sudoku/types';

const SCHEMA_VERSION = 1;

// Smallest first, so with both sizes open a random value below 0.5 picks 6×6.
const GRID_SIZES: readonly GridSize[] = [6, 9];

// What the no-repeat rule remembers between picks.
export interface PlayHistory {
  solved: readonly string[]; // ids of solved puzzles; skipped or abandoned ones stay unplayed
  lastServed: readonly string[]; // the puzzle served most recently for each band and size
  // When each abandoned puzzle was last abandoned, in ms since 1970, by puzzle id. A solve
  // removes the entry. Nothing reads it yet: a later cooldown will hold these puzzles back.
  abandonedAt: Readonly<Record<string, number>>;
}

export const EMPTY_HISTORY: PlayHistory = { solved: [], lastServed: [], abandonedAt: {} };

// Every puzzle shipped with the app.
export function loadBundledCatalog(): Puzzle[] {
  return buildCatalog([pack9x9, pack6x6]);
}

// Ids must be unique across packs, because saved games and the results log refer to them.
export function buildCatalog(packs: readonly unknown[]): Puzzle[] {
  const catalog = packs.flatMap((pack) => parsePack(pack));
  const seen = new Set<string>();
  for (const { id } of catalog) {
    if (seen.has(id)) {
      throw new Error(`Duplicate puzzle id ${id}`);
    }
    seen.add(id);
  }
  return catalog;
}

// Checks a pack against the pack format in docs/phase_1.md and returns its puzzles.
export function parsePack(raw: unknown): Puzzle[] {
  if (!isRecord(raw)) {
    throw new Error('Pack is not a JSON object');
  }
  const packId = typeof raw.packId === 'string' ? raw.packId : '(no packId)';
  const fail = (reason: string) => new Error(`Pack ${packId}: ${reason}`);

  if (raw.schemaVersion !== SCHEMA_VERSION) {
    throw fail(`unknown schemaVersion ${JSON.stringify(raw.schemaVersion)}`);
  }
  if (raw.game !== 'sudoku') {
    throw fail(`game ${JSON.stringify(raw.game)} is not "sudoku"`);
  }
  const size = gridSize(raw.grid);
  if (size === null) {
    throw fail(`grid ${JSON.stringify(raw.grid)} is not a supported shape`);
  }
  if (!Array.isArray(raw.puzzles)) {
    throw fail('puzzles is not an array');
  }
  return raw.puzzles.map((entry: unknown, index: number) => {
    if (!isRecord(entry)) {
      throw fail(`puzzle ${index + 1} is not an object`);
    }
    const { id, band, givens, solution } = entry;
    if (typeof id !== 'string' || id === '') {
      throw fail(`puzzle ${index + 1} has no id`);
    }
    if (!isBand(band)) {
      throw fail(`${id} has band ${JSON.stringify(band)}, not 1–5`);
    }
    const cells = size * size;
    if (!isDigits(givens, cells, '0', size)) {
      throw fail(`${id} givens must be ${cells} characters from 0 to ${size}`);
    }
    if (!isDigits(solution, cells, '1', size)) {
      throw fail(`${id} solution must be ${cells} characters from 1 to ${size}`);
    }
    return { id, band, size, givens, solution };
  });
}

// Picks a size at even odds among those with unsolved puzzles in the band, then serves the next
// unsolved puzzle of that size after the one served last, wrapping around. Once every puzzle in
// the band is solved, the band starts over. `random` returns a number in [0, 1), like Math.random.
export function pickNextPuzzle(
  catalog: readonly Puzzle[],
  band: Band,
  history: PlayHistory,
  random: () => number,
): { puzzle: Puzzle; history: PlayHistory } {
  const inBand = catalog.filter((puzzle) => puzzle.band === band);
  if (inBand.length === 0) {
    throw new Error(`No puzzles in band ${band}`);
  }

  let solved = new Set(history.solved);
  if (inBand.every((puzzle) => solved.has(puzzle.id))) {
    const bandIds = new Set(inBand.map((puzzle) => puzzle.id));
    solved = new Set(history.solved.filter((id) => !bandIds.has(id)));
  }
  const isUnsolved = (puzzle: Puzzle) => !solved.has(puzzle.id);

  const sizes = GRID_SIZES.filter((size) =>
    inBand.some((puzzle) => puzzle.size === size && isUnsolved(puzzle)),
  );
  const size = sizes[Math.floor(random() * sizes.length)];

  // This size's puzzles in pack order, rotated to start just after the one served last.
  const ofSize = inBand.filter((puzzle) => puzzle.size === size);
  const last = ofSize.findIndex((puzzle) => history.lastServed.includes(puzzle.id));
  const rotated = [...ofSize.slice(last + 1), ...ofSize.slice(0, last + 1)];
  const puzzle = rotated.filter(isUnsolved)[0];

  const ofSizeIds = new Set(ofSize.map((p) => p.id));
  return {
    puzzle,
    history: {
      solved: [...solved],
      lastServed: [...history.lastServed.filter((id) => !ofSizeIds.has(id)), puzzle.id],
      abandonedAt: history.abandonedAt,
    },
  };
}

// Only solved puzzles count as played for the no-repeat rule. A solve also clears the
// puzzle's abandon, if it has one.
export function markSolved(history: PlayHistory, puzzleId: string): PlayHistory {
  const solved = history.solved.includes(puzzleId);
  const abandoned = Object.hasOwn(history.abandonedAt, puzzleId);
  if (solved && !abandoned) {
    return history;
  }
  return {
    ...history,
    solved: solved ? history.solved : [...history.solved, puzzleId],
    abandonedAt: Object.fromEntries(
      Object.entries(history.abandonedAt).filter(([id]) => id !== puzzleId),
    ),
  };
}

// An abandoned puzzle stays unplayed, so it can be served again. When it was abandoned is kept
// for the cooldown that will hold such puzzles back for a while.
export function markAbandoned(history: PlayHistory, puzzleId: string, at: number): PlayHistory {
  return { ...history, abandonedAt: { ...history.abandonedAt, [puzzleId]: at } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function gridSize(grid: unknown): GridSize | null {
  if (!isRecord(grid)) {
    return null;
  }
  const match = GRID_SIZES.find(
    (size) =>
      grid.size === size &&
      grid.boxWidth === BOX_SHAPES[size].boxWidth &&
      grid.boxHeight === BOX_SHAPES[size].boxHeight,
  );
  return match ?? null;
}

function isBand(value: unknown): value is Band {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

// A string of exactly `length` digits, each from `lowest` to `size`.
function isDigits(
  value: unknown,
  length: number,
  lowest: '0' | '1',
  size: GridSize,
): value is string {
  return typeof value === 'string' && new RegExp(`^[${lowest}-${size}]{${length}}$`).test(value);
}
