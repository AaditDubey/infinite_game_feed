import type { Band } from './difficulty';

// The feed's rules: which pages it holds, which one is current, and what leaves it. Pure
// functions that return a new state and never mutate; callers pass in the time. The feed never
// knows whether a page is solved: the feed store asks the page's game.

export type GameKind = 'sudoku'; // Phase 3 adds 'rectangles' and 'queens'

export interface FeedItem {
  id: string; // 'page-<n>', never reused; keys this page's save
  game: GameKind;
  puzzleId: string;
  band: Band;
  seen: boolean; // the feed has settled on it at least once
  leftAt: number | null; // when the player last swiped away from it, ms since 1970
}

// What a new page needs; the feed adds the rest.
export type NewPage = Pick<FeedItem, 'game' | 'puzzleId' | 'band'>;

export interface FeedState {
  items: FeedItem[]; // oldest first: the back history, the current page, then the pages ahead
  current: number; // index into items
  nextId: number; // the number in the next page's id
  forwardSwipes: number; // settles on a later page; stops counting at LEARNED_AFTER
}

export const BACK_HISTORY = 20; // seen pages kept behind the current one
export const AHEAD = 1; // unseen pages kept ready below the current one
export const LEARNED_AFTER = 3; // forward swipes after which the swipe label stops

// A feed of one page, already seen: the first page is on screen as soon as the feed opens.
export function createFeed(first: NewPage): FeedState {
  return {
    items: [{ id: 'page-1', ...first, seen: true, leftAt: null }],
    current: 0,
    nextId: 2,
    forwardSwipes: 0,
  };
}

// Adds an unseen page at the end, below the current one.
export function append(state: FeedState, page: NewPage): FeedState {
  const item: FeedItem = { id: `page-${state.nextId}`, ...page, seen: false, leftAt: null };
  return { ...state, items: [...state.items, item], nextId: state.nextId + 1 };
}

// The list came to rest on page `index`. The page left records when, the page reached is seen,
// and a later page counts as a forward swipe. Pages more than BACK_HISTORY behind the new
// current page leave the feed; they come back in `dropped`, oldest first. With one page per
// swipe, every page behind the current one has been seen.
//
// Settling on the current page, or on an index outside the list, changes nothing and returns
// the same state.
export function settleOn(
  state: FeedState,
  index: number,
  now: number,
): { state: FeedState; dropped: FeedItem[] } {
  const { items, current } = state;
  if (index === current || !Number.isInteger(index) || index < 0 || index >= items.length) {
    return { state, dropped: [] };
  }
  const settled = items.map((item, i) => {
    if (i === current) {
      return { ...item, leftAt: now };
    }
    if (i === index && !item.seen) {
      return { ...item, seen: true };
    }
    return item;
  });
  const forwardSwipes =
    index > current ? Math.min(state.forwardSwipes + 1, LEARNED_AFTER) : state.forwardSwipes;
  const drop = Math.max(0, index - BACK_HISTORY);
  return {
    state: { ...state, items: settled.slice(drop), current: index - drop, forwardSwipes },
    dropped: settled.slice(0, drop),
  };
}

// How many pages to append so that AHEAD unseen pages wait below the current one.
export function missingAhead(state: FeedState): number {
  const ahead = state.items.length - 1 - state.current;
  return Math.max(0, AHEAD - ahead);
}

// Once learned, the swipe label never shows again.
export function gestureLearned(state: FeedState): boolean {
  return state.forwardSwipes >= LEARNED_AFTER;
}
