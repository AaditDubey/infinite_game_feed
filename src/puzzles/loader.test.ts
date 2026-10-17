import { BOX_SHAPES, type Band, type GridSize, type Puzzle } from '@/games/sudoku/types';

import {
  EMPTY_HISTORY,
  buildCatalog,
  loadBundledCatalog,
  markSolved,
  parsePack,
  pickNextPuzzle,
  type PlayHistory,
} from './loader';

// Real puzzles copied from the bundled packs, with every field the JSON has.
const PUZZLE_9X9 = {
  id: 'sudoku-9x9-001-0001',
  band: 1,
  grade: 'trivial',
  givens: '080527000560800000070000030608050094005103200720040503090000050000009048000385070',
  solution: '389527416564831729172496835638752194945163287721948563893274651257619348416385972',
  clues: 32,
  sourceId: '3x3:a8a5_2_7c5_6a8f7e3a6a8a5b9_4b5_1a3_2b7_2b4a5a3a9e5f9a4_8c3_8_5a7a',
};

const PUZZLE_6X6 = {
  id: 'sudoku-6x6-001-0001',
  band: 1,
  grade: 'trivial',
  givens: '002000045000020601506030000160000400',
  solution: '132546645312423651516234254163361425',
  clues: 12,
  sourceId: '2x3:b2d4_5d2a6a1_5a6a3d1_6d4b',
};

function makePack(size: GridSize, puzzles: object[] = [size === 9 ? PUZZLE_9X9 : PUZZLE_6X6]) {
  return {
    schemaVersion: 1,
    game: 'sudoku',
    packId: `sudoku-${size}x${size}-test`,
    grid: { size, ...BOX_SHAPES[size] },
    createdAt: '2026-10-17',
    generator: { name: 'tatham-solo', version: 'test' },
    puzzles,
  };
}

describe('parsePack', () => {
  it('returns the puzzles of a 9×9 pack with only the fields the app uses', () => {
    expect(parsePack(makePack(9))).toEqual([
      {
        id: PUZZLE_9X9.id,
        band: 1,
        size: 9,
        givens: PUZZLE_9X9.givens,
        solution: PUZZLE_9X9.solution,
      },
    ]);
  });

  it('returns the puzzles of a 6×6 pack', () => {
    expect(parsePack(makePack(6))).toEqual([
      {
        id: PUZZLE_6X6.id,
        band: 1,
        size: 6,
        givens: PUZZLE_6X6.givens,
        solution: PUZZLE_6X6.solution,
      },
    ]);
  });

  it.each([null, [], 'pack'])('rejects %p, which is not a pack object', (raw) => {
    expect(() => parsePack(raw)).toThrow('Pack is not a JSON object');
  });

  it.each([undefined, 0, 2, '1'])('rejects schemaVersion %p', (schemaVersion) => {
    expect(() => parsePack({ ...makePack(9), schemaVersion })).toThrow(
      'Pack sudoku-9x9-test: unknown schemaVersion',
    );
  });

  it('rejects a pack for another game', () => {
    expect(() => parsePack({ ...makePack(9), game: 'queens' })).toThrow('is not "sudoku"');
  });

  it.each([
    ['6×6 with boxes 2 wide and 3 tall', { size: 6, boxWidth: 2, boxHeight: 3 }],
    ['9×9 with boxes 3 wide and 2 tall', { size: 9, boxWidth: 3, boxHeight: 2 }],
    ['4×4', { size: 4, boxWidth: 2, boxHeight: 2 }],
    ['missing', undefined],
  ])('rejects a grid that is %s', (_name, grid) => {
    expect(() => parsePack({ ...makePack(6), grid })).toThrow('is not a supported shape');
  });

  it('rejects a pack whose puzzles are not an array', () => {
    expect(() => parsePack({ ...makePack(9), puzzles: {} })).toThrow('puzzles is not an array');
  });

  it.each([
    ['no id', { id: undefined }, 'puzzle 1 has no id'],
    ['an empty id', { id: '' }, 'puzzle 1 has no id'],
    ['band 0', { band: 0 }, 'band 0, not 1–5'],
    ['band 6', { band: 6 }, 'band 6, not 1–5'],
    ['band 2.5', { band: 2.5 }, 'band 2.5, not 1–5'],
    ['band "1"', { band: '1' }, 'band "1", not 1–5'],
    ['givens one cell short', { givens: PUZZLE_9X9.givens.slice(1) }, 'givens must be 81'],
    ['givens with a letter', { givens: 'x' + PUZZLE_9X9.givens.slice(1) }, 'givens must be 81'],
    ['an empty solution cell', { solution: '0' + PUZZLE_9X9.solution.slice(1) }, 'solution must'],
  ])('rejects a 9×9 puzzle with %s', (_name, change, message) => {
    expect(() => parsePack(makePack(9, [{ ...PUZZLE_9X9, ...change }]))).toThrow(message);
  });

  it('rejects a 6×6 puzzle that uses the digit 7', () => {
    const givens = '7' + PUZZLE_6X6.givens.slice(1);
    expect(() => parsePack(makePack(6, [{ ...PUZZLE_6X6, givens }]))).toThrow(
      'sudoku-6x6-001-0001 givens must be 36 characters from 0 to 6',
    );
  });
});

describe('buildCatalog', () => {
  it('joins the puzzles of every pack in order', () => {
    const catalog = buildCatalog([makePack(9), makePack(6)]);
    expect(catalog.map((puzzle) => puzzle.id)).toEqual([PUZZLE_9X9.id, PUZZLE_6X6.id]);
  });

  it('rejects a puzzle id that appears twice', () => {
    expect(() => buildCatalog([makePack(9), makePack(9)])).toThrow(
      'Duplicate puzzle id sudoku-9x9-001-0001',
    );
  });
});

describe('loadBundledCatalog', () => {
  it('loads 100 puzzles per band for each grid size from the shipped packs', () => {
    const catalog = loadBundledCatalog();
    const counts: Record<string, number> = {};
    for (const { size, band } of catalog) {
      const key = `${size}x${size} band ${band}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const expected: Record<string, number> = {};
    for (const size of [9, 6]) {
      for (const band of [1, 2, 3, 4, 5]) {
        expected[`${size}x${size} band ${band}`] = 100;
      }
    }
    expect(counts).toEqual(expected);
  });
});

function puzzle(size: GridSize, band: Band, n: number): Puzzle {
  const sample = size === 9 ? PUZZLE_9X9 : PUZZLE_6X6;
  return {
    id: `${size}x${size}-band${band}-${n}`,
    band,
    size,
    givens: sample.givens,
    solution: sample.solution,
  };
}

// Band 1 has three 9×9 puzzles and two 6×6 ones, band 2 has one of each, and band 5 has none.
const CATALOG: Puzzle[] = [
  puzzle(9, 1, 1),
  puzzle(9, 1, 2),
  puzzle(9, 1, 3),
  puzzle(9, 2, 1),
  puzzle(6, 1, 1),
  puzzle(6, 1, 2),
  puzzle(6, 2, 1),
];

// With both sizes open, a random value below 0.5 picks 6×6 and the rest pick 9×9.
const pickSix = () => 0;
const pickNine = () => 0.99;

// Picks once per random source, in turn, and marks each puzzle solved if `solve` is set.
function serve(
  band: Band,
  randoms: (() => number)[],
  solve: boolean,
  start: PlayHistory = EMPTY_HISTORY,
) {
  let history = start;
  const served: string[] = [];
  for (const random of randoms) {
    const next = pickNextPuzzle(CATALOG, band, history, random);
    served.push(next.puzzle.id);
    history = solve ? markSolved(next.history, next.puzzle.id) : next.history;
  }
  return { served, history };
}

describe('pickNextPuzzle', () => {
  it('serves the first puzzle of the picked size, in pack order', () => {
    expect(pickNextPuzzle(CATALOG, 1, EMPTY_HISTORY, pickNine).puzzle.id).toBe('9x9-band1-1');
    expect(pickNextPuzzle(CATALOG, 1, EMPTY_HISTORY, pickSix).puzzle.id).toBe('6x6-band1-1');
  });

  it('picks each size with even odds', () => {
    expect(pickNextPuzzle(CATALOG, 1, EMPTY_HISTORY, () => 0.49).puzzle.size).toBe(6);
    expect(pickNextPuzzle(CATALOG, 1, EMPTY_HISTORY, () => 0.5).puzzle.size).toBe(9);
  });

  it('serves only puzzles from the requested band', () => {
    expect(pickNextPuzzle(CATALOG, 2, EMPTY_HISTORY, pickNine).puzzle.id).toBe('9x9-band2-1');
    expect(pickNextPuzzle(CATALOG, 2, EMPTY_HISTORY, pickSix).puzzle.id).toBe('6x6-band2-1');
  });

  it('serves skipped puzzles again only after the rest of their size', () => {
    const { served } = serve(1, [pickNine, pickNine, pickNine, pickNine], false);
    expect(served).toEqual(['9x9-band1-1', '9x9-band1-2', '9x9-band1-3', '9x9-band1-1']);
  });

  it('keeps a separate place in the order for each size', () => {
    const { served } = serve(1, [pickNine, pickSix, pickNine, pickSix, pickSix], false);
    expect(served).toEqual([
      '9x9-band1-1',
      '6x6-band1-1',
      '9x9-band1-2',
      '6x6-band1-2',
      '6x6-band1-1',
    ]);
  });

  it('never serves a solved puzzle', () => {
    const start = markSolved(EMPTY_HISTORY, '9x9-band1-2');
    const { served } = serve(1, [pickNine, pickNine, pickNine], false, start);
    expect(served).toEqual(['9x9-band1-1', '9x9-band1-3', '9x9-band1-1']);
  });

  it('serves the other size whatever the random value once one size is solved', () => {
    const { served } = serve(1, [pickNine, pickNine, pickNine, pickNine], true);
    expect(served).toEqual(['9x9-band1-1', '9x9-band1-2', '9x9-band1-3', '6x6-band1-1']);
  });

  it('starts the band over once every puzzle in it is solved', () => {
    const start = markSolved(EMPTY_HISTORY, '9x9-band2-1');
    const { history } = serve(1, [pickNine, pickNine, pickNine, pickSix, pickSix], true, start);
    expect(history.solved).toHaveLength(6);

    const next = pickNextPuzzle(CATALOG, 1, history, pickNine);
    expect(next.puzzle.id).toBe('9x9-band1-1');
    expect(next.history.solved).toEqual(['9x9-band2-1']);
  });

  it('remembers one last-served puzzle per band and size', () => {
    const { history } = serve(1, [pickNine, pickNine, pickSix], false);
    const next = pickNextPuzzle(CATALOG, 2, history, pickNine);
    expect(next.history.lastServed).toEqual(['9x9-band1-2', '6x6-band1-1', '9x9-band2-1']);
  });

  it('leaves the history it was given unchanged', () => {
    const history: PlayHistory = Object.freeze({
      solved: Object.freeze(['9x9-band1-1']),
      lastServed: Object.freeze(['6x6-band1-1']),
    });
    pickNextPuzzle(CATALOG, 1, history, pickNine);
    expect(history).toEqual({ solved: ['9x9-band1-1'], lastServed: ['6x6-band1-1'] });
  });

  it('throws when the band has no puzzles', () => {
    expect(() => pickNextPuzzle(CATALOG, 5, EMPTY_HISTORY, pickNine)).toThrow(
      'No puzzles in band 5',
    );
  });

  it('serves all 200 puzzles of a shipped band before repeating one, when each is solved', () => {
    const catalog = loadBundledCatalog();
    const values = [0.1, 0.7, 0.3, 0.9, 0.6];
    let call = 0;
    const random = () => values[call++ % values.length];

    let history = EMPTY_HISTORY;
    const served = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const next = pickNextPuzzle(catalog, 3, history, random);
      served.add(next.puzzle.id);
      history = markSolved(next.history, next.puzzle.id);
    }
    expect(served.size).toBe(200);

    const again = pickNextPuzzle(catalog, 3, history, random);
    expect(served.has(again.puzzle.id)).toBe(true);
    expect(again.history.solved).toEqual([]);
  });
});

describe('markSolved', () => {
  it('records a solved puzzle once and leaves lastServed alone', () => {
    const history = markSolved({ solved: [], lastServed: ['9x9-band1-1'] }, '9x9-band1-1');
    expect(history).toEqual({ solved: ['9x9-band1-1'], lastServed: ['9x9-band1-1'] });
    expect(markSolved(history, '9x9-band1-1')).toBe(history);
  });
});
