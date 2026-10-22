import { EMPTY_HISTORY } from '@/puzzles/loader';
import { appendResult, loadSudoku, saveGame, savePlayHistory } from '@/storage/persistence';

import { AHEAD, BACK_HISTORY, append, type FeedState } from './feed';
import { GAMES, type GameStore } from './games';
import { useFeedStore } from './store';

jest.mock('@/haptics/haptics', () => ({ tapForMistake: jest.fn() }));
jest.mock('@/storage/persistence', () => ({
  loadSudoku: jest.fn(),
  saveGame: jest.fn(),
  savePlayHistory: jest.fn(),
  appendResult: jest.fn(),
}));

// These tests drive Sudoku only through its store's own actions, so even the test stays clear
// of src/games/.
type PageState = ReturnType<GameStore['getState']>;
type Digit = Parameters<PageState['inputDigit']>[0];

const feedStore = () => useFeedStore.getState();

function feed(): FeedState {
  const { feed } = feedStore();
  if (feed === null) {
    throw new Error('The feed has not been restored');
  }
  return feed;
}

// The game store of the page at `index`, or of the current page.
function pageAt(index = feed().current): PageState {
  return feedStore().stores[feed().items[index].id].getState();
}

function answer(page: PageState, index: number): Digit {
  return Number(page.game.puzzle.solution[index]) as Digit; // solution chars are 1 to size
}

function emptyCells(page: PageState): number[] {
  return page.game.cells.flatMap((cell, index) => (cell.value === null ? [index] : []));
}

// A wrong digit in the current page's first empty cell.
function makeMistake() {
  const page = pageAt();
  const [cell] = emptyCells(page);
  page.select(cell);
  page.inputDigit(answer(page, cell) === 1 ? 2 : 1);
}

function solveCurrent() {
  for (const cell of emptyCells(pageAt())) {
    pageAt().select(cell);
    pageAt().inputDigit(answer(pageAt(), cell));
  }
}

// Swipes forward `times` times, one second apart, starting a second after the current time.
function swipeForward(times: number) {
  for (let i = 0; i < times; i++) {
    jest.setSystemTime(Date.now() + 1_000);
    feedStore().settleOn(feed().current + 1);
  }
}

let random: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
  useFeedStore.setState({ feed: null, stores: {} });
  jest.clearAllMocks();
  jest.mocked(loadSudoku).mockResolvedValue({ game: null, playHistory: EMPTY_HISTORY });
  // Below 0.8 picks Easy, and below 0.5 picks 6×6, so every page is a new Easy 6×6 puzzle.
  random = jest.spyOn(Math, 'random').mockReturnValue(0.1);
});

afterEach(() => {
  random.mockRestore();
  jest.useRealTimers();
});

describe('restore', () => {
  it('starts the feed on one seen page, with an unseen page waiting ahead', async () => {
    await feedStore().restore();
    const { items, current } = feed();

    expect(items).toHaveLength(1 + AHEAD);
    expect(current).toBe(0);
    expect(items.map((item) => item.seen)).toEqual([true, false]);
    expect(Object.keys(feedStore().stores)).toEqual(items.map((item) => item.id));
  });

  it("runs only the current page's timer", async () => {
    jest.setSystemTime(5_000);
    await feedStore().restore();
    expect(pageAt(0).timer).toEqual({ elapsedMs: 0, runningSince: 5_000 });
    expect(pageAt(1).timer).toEqual({ elapsedMs: 0, runningSince: null });
  });

  it("gives each page its band's puzzle, and Medium from 0.8 up", async () => {
    random.mockReturnValue(0.9);
    await feedStore().restore();
    for (const [index, item] of feed().items.entries()) {
      expect(item.band).toBe(2);
      expect(pageAt(index).game.puzzle).toMatchObject({ id: item.puzzleId, band: 2 });
    }
  });

  it('loads the play history before picking the first puzzle', async () => {
    await feedStore().restore();
    const [first, second] = feed().items.map((item) => item.puzzleId);

    // With the first puzzle solved, a fresh start serves the second one first.
    useFeedStore.setState({ feed: null, stores: {} });
    jest
      .mocked(loadSudoku)
      .mockResolvedValueOnce({ game: null, playHistory: { ...EMPTY_HISTORY, solved: [first] } });
    await feedStore().restore();
    expect(feed().items[0].puzzleId).toBe(second);
  });

  it('starts only one feed when it runs twice at once', async () => {
    await Promise.all([feedStore().restore(), feedStore().restore()]);
    expect(feed().items).toHaveLength(1 + AHEAD);
    expect(savePlayHistory).toHaveBeenCalledTimes(1 + AHEAD);
  });

  it('does nothing once the feed exists', async () => {
    await feedStore().restore();
    const started = feed();
    await feedStore().restore();
    expect(feed()).toBe(started);
  });
});

describe('settling', () => {
  beforeEach(async () => {
    await feedStore().restore();
    // Starting the first page's timer saved it, so every test starts with no calls recorded.
    jest.clearAllMocks();
  });

  it('moving forward pauses the page left, runs the page reached and draws the next one', () => {
    jest.setSystemTime(10_000);
    feedStore().settleOn(1);
    const { items, current, forwardSwipes } = feed();

    expect(current).toBe(1);
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.seen)).toEqual([true, true, false]);
    expect(items[0].leftAt).toBe(10_000);
    expect(forwardSwipes).toBe(1);
    expect(pageAt(0).timer).toEqual({ elapsedMs: 10_000, runningSince: null });
    expect(pageAt(1).timer).toEqual({ elapsedMs: 0, runningSince: 10_000 });
    expect(pageAt(2).timer.runningSince).toBeNull();
  });

  it('saves the page left with its play time', () => {
    jest.setSystemTime(10_000);
    feedStore().settleOn(1);
    expect(saveGame).toHaveBeenCalledWith(pageAt(0).game, 10_000);
  });

  it('moving back draws nothing new and swaps which timer runs', () => {
    jest.setSystemTime(10_000);
    feedStore().settleOn(1);
    jest.setSystemTime(15_000);
    feedStore().settleOn(0);

    expect(feed().items).toHaveLength(3);
    expect(feed().forwardSwipes).toBe(1);
    expect(pageAt(0).timer).toEqual({ elapsedMs: 10_000, runningSince: 15_000 });
    expect(pageAt(1).timer).toEqual({ elapsedMs: 5_000, runningSince: null });
  });

  it('counts time on a page only while it is current', () => {
    jest.setSystemTime(10_000);
    feedStore().settleOn(1); // 10 s on the first page
    jest.setSystemTime(30_000);
    feedStore().settleOn(0); // 20 s away
    jest.setSystemTime(35_000);
    feedStore().settleOn(1); // 5 s more

    expect(pageAt(0).timer).toEqual({ elapsedMs: 15_000, runningSince: null });
  });

  it('keeps an unsolved page exactly as it was left', () => {
    makeMistake();
    pageAt().toggleNotesMode();
    const left = pageAt(0);
    feedStore().settleOn(1);
    feedStore().settleOn(0);

    expect(pageAt().game).toBe(left.game);
    expect(pageAt().notesMode).toBe(true);
    expect(pageAt().selected).toBe(left.selected);
  });

  it('changes nothing when the list settles back on the current page', () => {
    const before = feedStore();
    feedStore().settleOn(0);
    expect(feedStore().feed).toBe(before.feed);
    expect(feedStore().stores).toBe(before.stores);
    expect(saveGame).not.toHaveBeenCalled();
  });

  it('does nothing before the feed is restored', () => {
    useFeedStore.setState({ feed: null, stores: {} });
    feedStore().settleOn(1);
    expect(feedStore().feed).toBeNull();
  });
});

describe('back history and abandons', () => {
  beforeEach(async () => {
    await feedStore().restore();
  });

  it(`keeps ${BACK_HISTORY} pages behind the current one, then drops the oldest and its store`, () => {
    swipeForward(BACK_HISTORY);
    expect(feed().items[0].id).toBe('page-1');

    swipeForward(1);
    expect(feed().current).toBe(BACK_HISTORY);
    expect(feed().items[0].id).toBe('page-2');
    expect(feedStore().stores).not.toHaveProperty('page-1');
    expect(Object.keys(feedStore().stores)).toHaveLength(feed().items.length);
  });

  it('logs a dropped unsolved page as abandoned, with when it was last left', () => {
    const first = feed().items[0];
    makeMistake();
    swipeForward(BACK_HISTORY + 1); // the first swipe leaves the first page at 1 s

    expect(appendResult).toHaveBeenCalledTimes(1);
    expect(appendResult).toHaveBeenCalledWith({
      outcome: 'abandoned',
      puzzleId: first.puzzleId,
      size: 6,
      band: 1,
      at: 1_000,
      elapsedMs: 1_000,
      mistakes: 1,
    });
    expect(savePlayHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ abandonedAt: { [first.puzzleId]: 1_000 } }),
    );
  });

  it('logs each dropped page once, oldest first', () => {
    const [first, second] = feed().items;
    swipeForward(BACK_HISTORY + 2);
    expect(jest.mocked(appendResult).mock.calls.map(([entry]) => entry.puzzleId)).toEqual([
      first.puzzleId,
      second.puzzleId,
    ]);
  });

  it('logs a page solved before it was dropped only as solved', () => {
    solveCurrent();
    swipeForward(BACK_HISTORY + 1);
    expect(appendResult).toHaveBeenCalledTimes(1);
    expect(appendResult).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'solved' }));
  });

  it('logs a page solved after swiping back to it only as solved', () => {
    swipeForward(2);
    feedStore().settleOn(0);
    solveCurrent();
    swipeForward(BACK_HISTORY + 2); // drops the solved first page and the unsolved second one
    expect(jest.mocked(appendResult).mock.calls.map(([entry]) => entry.outcome)).toEqual([
      'solved',
      'abandoned',
    ]);
  });

  it('never logs a page that was drawn but never seen', () => {
    // A third page, so that one settle can skip over the second.
    const { puzzleId, store } = GAMES.sudoku.serve(1, Math.random);
    const extended = append(feed(), { game: 'sudoku', puzzleId, band: 1 });
    useFeedStore.setState({
      feed: extended,
      stores: { ...feedStore().stores, [extended.items[2].id]: store },
    });

    jest.setSystemTime(1_000);
    feedStore().settleOn(2);
    swipeForward(BACK_HISTORY); // drops the first two pages

    expect(feed().items[0].id).toBe('page-3');
    expect(jest.mocked(appendResult).mock.calls.map(([entry]) => entry.puzzleId)).toEqual([
      extended.items[0].puzzleId,
    ]);
  });
});

describe('the app in the background', () => {
  beforeEach(async () => {
    await feedStore().restore();
  });

  it("pauses and saves the current page's timer, then resumes it", () => {
    jest.setSystemTime(8_000);
    feedStore().pauseCurrent();
    expect(pageAt().timer).toEqual({ elapsedMs: 8_000, runningSince: null });
    expect(saveGame).toHaveBeenLastCalledWith(pageAt().game, 8_000);

    jest.setSystemTime(60_000);
    feedStore().resumeCurrent();
    expect(pageAt().timer).toEqual({ elapsedMs: 8_000, runningSince: 60_000 });
    expect(pageAt(1).timer.runningSince).toBeNull();
  });

  it('saves the current page without pausing it', () => {
    jest.setSystemTime(8_000);
    feedStore().saveCurrentNow();
    expect(saveGame).toHaveBeenCalledWith(pageAt().game, 8_000);
    expect(pageAt().timer.runningSince).toBe(0);
  });

  it("doesn't restart a solved page's timer", () => {
    jest.setSystemTime(8_000);
    solveCurrent();
    feedStore().pauseCurrent();
    feedStore().resumeCurrent();
    expect(pageAt().timer).toEqual({ elapsedMs: 8_000, runningSince: null });
  });
});
