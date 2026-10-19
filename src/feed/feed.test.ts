import {
  AHEAD,
  BACK_HISTORY,
  LEARNED_AFTER,
  append,
  createFeed,
  gestureLearned,
  missingAhead,
  settleOn,
  type FeedState,
  type NewPage,
} from './feed';

// A different puzzle for each number, so pages are easy to tell apart.
function page(n: number): NewPage {
  return { game: 'sudoku', puzzleId: `puzzle-${n}`, band: 1 };
}

// Keeps a page ready ahead, then settles on it at `now`, like a forward swipe.
function swipeForward(state: FeedState, now: number): ReturnType<typeof settleOn> {
  const ready = missingAhead(state) > 0 ? append(state, page(state.nextId)) : state;
  return settleOn(ready, ready.current + 1, now);
}

// A feed after `swipes` forward swipes, one second apart.
function feedAfter(swipes: number): FeedState {
  let state = createFeed(page(1));
  for (let i = 1; i <= swipes; i++) {
    state = swipeForward(state, i * 1000).state;
  }
  return state;
}

describe('createFeed', () => {
  it('starts with one page, already seen and current', () => {
    expect(createFeed(page(1))).toEqual({
      items: [{ id: 'page-1', ...page(1), seen: true, leftAt: null }],
      current: 0,
      nextId: 2,
      forwardSwipes: 0,
    });
  });
});

describe('append', () => {
  it('adds an unseen page at the end with the next page id', () => {
    const state = append(createFeed(page(1)), page(7));
    expect(state.items[1]).toEqual({ id: 'page-2', ...page(7), seen: false, leftAt: null });
    expect(state.current).toBe(0);
    expect(state.nextId).toBe(3);
  });

  it('never reuses a page id, even for the same puzzle', () => {
    const state = append(append(createFeed(page(1)), page(1)), page(1));
    expect(state.items.map((item) => item.id)).toEqual(['page-1', 'page-2', 'page-3']);
  });
});

describe('settleOn', () => {
  it('moves forward: the page left records when, and the page reached is seen', () => {
    const start = append(createFeed(page(1)), page(2));
    const { state, dropped } = settleOn(start, 1, 5_000);

    expect(state.current).toBe(1);
    expect(state.items[0]).toMatchObject({ seen: true, leftAt: 5_000 });
    expect(state.items[1]).toMatchObject({ seen: true, leftAt: null });
    expect(state.forwardSwipes).toBe(1);
    expect(dropped).toEqual([]);
  });

  it("moves back without counting a forward swipe or changing what's ahead", () => {
    const start = feedAfter(2); // pages 1 and 2 behind, 3 current
    const withAhead = append(start, page(9));
    const { state, dropped } = settleOn(withAhead, 1, 9_000);

    expect(state.current).toBe(1);
    expect(state.items[2]).toMatchObject({ leftAt: 9_000 });
    expect(state.items[3]).toMatchObject({ seen: false });
    expect(state.forwardSwipes).toBe(2);
    expect(dropped).toEqual([]);
  });

  it('records the latest time each page was left', () => {
    let state = feedAfter(1); // left page 1 at 1 s
    state = settleOn(state, 0, 4_000).state;
    state = settleOn(state, 1, 6_000).state;
    expect(state.items[0].leftAt).toBe(6_000);
    expect(state.items[1].leftAt).toBe(4_000);
  });

  it('changes nothing when the list settles back on the current page', () => {
    const start = feedAfter(1);
    const result = settleOn(start, start.current, 9_000);
    expect(result.state).toBe(start);
    expect(result.dropped).toEqual([]);
  });

  it('changes nothing for an index outside the list, so nothing comes before the oldest page', () => {
    const start = feedAfter(1);
    expect(settleOn(start, -1, 9_000).state).toBe(start);
    expect(settleOn(start, start.items.length, 9_000).state).toBe(start);
  });
});

describe('back history', () => {
  it(`keeps ${BACK_HISTORY} seen pages behind the current one`, () => {
    let state = createFeed(page(1));
    for (let i = 1; i <= BACK_HISTORY; i++) {
      const result = swipeForward(state, i * 1000);
      expect(result.dropped).toEqual([]);
      state = result.state;
    }
    expect(state.current).toBe(BACK_HISTORY);
    expect(state.items.slice(0, state.current).every((item) => item.seen)).toBe(true);
  });

  it('drops the oldest page, with when it was left, once one more would be kept', () => {
    const full = feedAfter(BACK_HISTORY);
    const { state, dropped } = swipeForward(full, 99_000);

    expect(dropped).toEqual([{ id: 'page-1', ...page(1), seen: true, leftAt: 1_000 }]);
    expect(state.current).toBe(BACK_HISTORY);
    expect(state.items[0].id).toBe('page-2');
    expect(state.items[state.current].id).toBe(`page-${BACK_HISTORY + 2}`);
  });

  it('drops every page that falls more than the limit behind, oldest first', () => {
    let state = feedAfter(BACK_HISTORY);
    state = append(append(state, page(90)), page(91));
    const { state: after, dropped } = settleOn(state, state.current + 2, 99_000);

    expect(dropped.map((item) => item.id)).toEqual(['page-1', 'page-2']);
    expect(after.current).toBe(BACK_HISTORY);
  });

  it('keeps numbering new pages after pages have left', () => {
    const state = append(feedAfter(BACK_HISTORY + 3), page(99));
    const ids = state.items.map((item) => Number(item.id.slice('page-'.length)));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[ids.length - 1]).toBe(state.nextId - 1);
  });
});

describe('pages ahead', () => {
  it(`keeps ${AHEAD} unseen page ready below the current one`, () => {
    const fresh = createFeed(page(1));
    expect(missingAhead(fresh)).toBe(AHEAD);
    expect(missingAhead(append(fresh, page(2)))).toBe(0);
  });

  it('asks for a new page after settling on the newest one', () => {
    const { state } = settleOn(append(createFeed(page(1)), page(2)), 1, 1_000);
    expect(missingAhead(state)).toBe(1);
  });

  it('asks for nothing while the current page is further back', () => {
    const { state } = settleOn(feedAfter(3), 1, 9_000);
    expect(missingAhead(state)).toBe(0);
  });
});

describe('learning the gesture', () => {
  it(`counts forward swipes until ${LEARNED_AFTER}, and then stops`, () => {
    expect(feedAfter(LEARNED_AFTER - 1).forwardSwipes).toBe(LEARNED_AFTER - 1);
    expect(gestureLearned(feedAfter(LEARNED_AFTER - 1))).toBe(false);
    expect(gestureLearned(feedAfter(LEARNED_AFTER))).toBe(true);
    expect(feedAfter(LEARNED_AFTER + 5).forwardSwipes).toBe(LEARNED_AFTER);
  });

  it("doesn't count back swipes, but counts a forward swipe to a page already seen", () => {
    let state = feedAfter(2);
    state = settleOn(state, 0, 9_000).state;
    expect(state.forwardSwipes).toBe(2);
    state = settleOn(state, 1, 10_000).state;
    expect(state.forwardSwipes).toBe(3);
  });
});
