import { create } from 'zustand';

import { pickBand } from './difficulty';
import {
  append,
  createFeed,
  missingAhead,
  settleOn as settle,
  type FeedState,
  type GameKind,
  type NewPage,
} from './feed';
import { GAMES, type GameStore } from './games';

type Stores = Readonly<Record<string, GameStore>>; // by page id

// The feed screen's state: the pages, which one is current, and each page's own game store.
// The rules live in feed.ts; this store applies them, starts and stops each page's timer, and
// has the games log the pages that leave the feed unsolved. Nothing here is saved yet.
interface FeedStore {
  feed: FeedState | null; // null until restore() has run
  stores: Stores; // made when a page is added, thrown away when it leaves
  restore: () => Promise<void>; // on launch: loads the play history and starts the feed
  settleOn: (index: number) => void; // the list came to rest on page `index`
  pauseCurrent: () => void; // the app went to the background
  resumeCurrent: () => void; // the app came back
  saveCurrentNow: () => void; // iOS's inactive state: saves without pausing
}

// Phase 2 serves only Sudoku; Phase 3 picks among the games.
const NEXT_GAME: GameKind = 'sudoku';

// A new page from the difficulty mix, with its store's timer paused until the page is seen.
function newPage(): { page: NewPage; store: GameStore } {
  const band = pickBand(Math.random);
  const { puzzleId, store } = GAMES[NEXT_GAME].serve(band, Math.random);
  return { page: { game: NEXT_GAME, puzzleId, band }, store };
}

// Adds pages until AHEAD unseen ones wait below the current page, so the next one is drawn
// before the player reaches it.
function fillAhead(start: FeedState, startStores: Stores): { feed: FeedState; stores: Stores } {
  let feed = start;
  let stores = startStores;
  while (missingAhead(feed) > 0) {
    const { page, store } = newPage();
    feed = append(feed, page);
    stores = { ...stores, [feed.items[feed.items.length - 1].id]: store };
  }
  return { feed, stores };
}

export const useFeedStore = create<FeedStore>()((set, get) => {
  // The current page's game, or null before restore().
  const current = () => {
    const { feed, stores } = get();
    return feed === null ? null : stores[feed.items[feed.current].id].getState();
  };

  return {
    feed: null,
    stores: {},
    restore: async () => {
      if (get().feed !== null) {
        return;
      }
      await Promise.all(Object.values(GAMES).map((game) => game.load()));
      // Another call may have finished first; the player could already be playing.
      if (get().feed !== null) {
        return;
      }
      const { page, store } = newPage();
      const feed = createFeed(page);
      store.getState().activate(Date.now());
      set(fillAhead(feed, { [feed.items[0].id]: store }));
    },
    settleOn: (index) => {
      const { feed, stores } = get();
      if (feed === null) {
        return;
      }
      const now = Date.now();
      const { state, dropped } = settle(feed, index, now);
      if (state === feed) {
        return;
      }
      stores[feed.items[feed.current].id].getState().deactivate(now);
      stores[state.items[state.current].id].getState().activate(now);
      // A page the player saw is logged as abandoned, at when it was last left, unless it's
      // solved: its game decides. A page drawn ahead but never seen leaves no trace.
      const gone = new Set(dropped.map((item) => item.id));
      for (const item of dropped) {
        if (item.seen) {
          stores[item.id].getState().abandon(item.leftAt ?? now);
        }
      }
      const kept = Object.fromEntries(Object.entries(stores).filter(([id]) => !gone.has(id)));
      set(fillAhead(state, kept));
    },
    pauseCurrent: () => current()?.deactivate(Date.now()),
    resumeCurrent: () => current()?.activate(Date.now()),
    saveCurrentNow: () => current()?.saveNow(),
  };
});
