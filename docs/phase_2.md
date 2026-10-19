# Infinite Games App: Phase 2 Spec (Swipe feed)

DRAFT, Oct 19, 2026 · @Aadit Dubey

Phase 2 turns Phase 1's single Sudoku screen into an endless vertical feed of Sudoku puzzles that you swipe through. This file lives at `docs/phase_2.md`. It builds on `docs/phase_1.md`, which still applies wherever this file doesn't say otherwise: the stack, the pipeline, the Sudoku rules, the quality bar and the rules for agents.

> **Draft status.** Lines marked **(owner)** are decisions you made on Oct 19. Lines marked **(proposed)** fill gaps and need your yes or no. Open questions are at the end. Delete this note once the spec is final.

## Context and scope

The feed is the heart of the app: one puzzle per screen, swipe to the next, swipe back to an earlier one. Phase 2 builds it with Sudoku only, in both sizes, but the feed itself knows nothing about Sudoku, so Rectangles and Queens slot in during Phase 3 without changing it.

**In scope:** the vertical feed with the next puzzle loaded ahead of time, swiping back, a fixed difficulty mix, abandons in the results log, and saving the feed so closing the app loses nothing.

**Out of scope for Phase 2:** other games, adaptive difficulty and its benchmarks, player ratings, streaks, the daily set, accounts or any backend, analytics, crash reporting, ads, subscriptions, sound, and visual polish. If a task seems to need one of these, stop and ask.

**Prerequisite:** the Expo SDK 58 upgrade (branch `task/sdk-58-upgrade`) is merged and checked on the phones in the store's SDK 58 Expo Go.

## Tech stack changes

Nothing new is installed. Everything from Phase 1 stays.

| Layer | Choice | Notes |
| --- | --- | --- |
| Feed | React Native's built-in `FlatList`, vertical, with paging **(owner)** | One puzzle per screen height. `FlatList` keeps only the puzzles near the current one mounted, so the feed can run forever. If it can't meet the quality bar, stop and ask before reaching for `react-native-pager-view` or a custom pager. |
| State | Zustand, one store per puzzle in the feed **(proposed)** | Phase 1 has one global Sudoku store, so only one board can exist. The feed shows the current board and the next one at the same time, so each puzzle gets its own store. A small feed store holds the list and the current position. |

## App behavior

### The feed

| Action | Behavior |
| --- | --- |
| Swipe to the next puzzle | The feed moves one puzzle forward. The next puzzle is already chosen and drawn, so it appears instantly. Each swipe moves exactly one puzzle. |
| Swipe back | Allowed **(owner)**. Earlier puzzles come back exactly as you left them: digits, notes, mistakes, undo history and time. An unsolved one can still be finished; a solved one shows its solved board and stats. |
| How far back | The last 20 puzzles you've seen **(proposed)**. Older ones drop off the feed for good. |
| Swipe direction | Like a vertical video feed: the next puzzle sits below the current one, so your finger moves up to bring it in **(proposed; see open question 1)**. |
| Seen | A puzzle counts as seen once the feed settles on it as the current puzzle **(proposed)**. A puzzle that was only loaded ahead of time, or that the feed scrolled past mid-swipe, isn't seen. |
| Timer | Each puzzle has its own timer, which starts when the puzzle is first seen. It runs only while that puzzle is the current one and the app is in the foreground (Phase 1's rules for the background and iOS's inactive state still apply). It pauses when you swipe away and resumes when you swipe back. |
| Playing | Taps on the board, number pad and toolbar work exactly as in Phase 1, and a tap must never turn into a swipe. A swipe starting on the board scrolls the feed. |

### Solving

- When a puzzle is solved, the feed waits for you to swipe **(owner)**. Nothing moves on by itself.
- The solved panel keeps the time and mistake count but loses the "Next puzzle" button **(proposed)**, since the swipe replaces it.
- A label at the bottom of the screen reads "Swipe down for next puzzle" and then disappears **(owner)**. It fades in when the puzzle is solved and fades out after 3 seconds **(proposed)**. See open questions 1 and 3.

### Screen

- **Top bar:** band label (Easy or Medium), timer, mistake count. Same as Phase 1.
- **Band picker:** removed. It was only for testing in Phase 1.
- **Board, number pad, toolbar, solved panel:** as in Phase 1, except for the solved panel change above.

### Difficulty

- The feed serves only Easy (band 1) and Medium (band 2) puzzles **(owner)**.
- Each new puzzle is Easy with probability 0.8 and Medium with probability 0.2 **(owner)**. The random source is passed in, so tests can fix it.
- Within the band, Phase 1's rules still pick the puzzle: a random size among those with unplayed puzzles, then the next unplayed puzzle of that size in pack order, with no solved puzzle repeating until the whole band has been solved.
- The benchmarks for adaptive difficulty (what counts as fast, slow or too many mistakes) will be decided later **(owner)**. Phase 2 only records the results they will need.
- Bands 3 to 5 stay in the packs, unused.
- Supply: 200 Easy and 200 Medium puzzles across both sizes. At 10 solves a day (8 of them Easy), Easy runs out after about 25 days and then starts over, as Phase 1's no-repeat rule says. A second pack (`pack-9x9-002` and `pack-6x6-002`) can come from the pipeline whenever needed.

### Results log

- A solve is logged as in Phase 1.
- An abandon is any puzzle the player has seen but not finished **(owner)**. It's logged with `outcome: 'abandoned'` and the same fields as a solve: puzzle id, size, band, time, elapsed milliseconds and mistakes.
- Because you can swipe back, an unsolved puzzle isn't abandoned yet while you can still return to it. It's logged as abandoned once it drops off the end of the 20-puzzle back history, with its total time and mistakes **(proposed; see open question 2)**. If you come back and solve it first, only the solve is logged.
- Each puzzle appearance in the feed gets exactly one entry: solved or abandoned. A puzzle that was only loaded ahead of time gets none, and stays unplayed so it can be served again.

### Persistence

- Save the feed: which puzzles are in the back history, which one is current, and the next one already chosen **(proposed)**. On launch, reopen on the same puzzle, with the same next puzzle waiting.
- Save each seen puzzle's game the way Phase 1 saves its one game: after every move, and when the app leaves the screen. Only the current puzzle changes, so each move writes only that puzzle's save (about 4 KB), never the whole feed.
- Twenty saved games take about 100 KB at most.
- Phase 1's saved game (`v1:sudoku:game`), if unsolved, becomes the first puzzle in the feed. Phase 1's play history (`v1:sudoku:playHistory`) and results log (`v1:sudoku:results`) carry on unchanged.
- Storage keys keep the `v1:` prefix.

### Quality bar

- Swiping follows the finger, settles on one puzzle per swipe, and never drops frames on the iPhone 13 Pro in release mode (`npx expo start --no-dev --minify`).
- The next puzzle is fully drawn before you reach it.
- Taps stay as instant as in Phase 1, and a tap never moves the feed.
- Android is checked when an Android phone is available, together with Phase 1's skipped Android pass.

## Feed design

The feed is a pure TypeScript module with no React, storage or clock, like the Sudoku engine. It knows puzzles only as `{ game, puzzleId, band }`, so other games fit in later. Callers pass in the time and the random source.

```ts
export type GameKind = 'sudoku'; // Phase 3 adds 'rectangles' and 'queens'

export interface FeedItem {
  game: GameKind;
  puzzleId: string;
  band: Band;
  seen: boolean;
}

export interface FeedState {
  items: FeedItem[]; // oldest first: the back history, the current item, then the next one
  current: number;   // index into items
}

// pickNext (the 80/20 mix plus Phase 1's no-repeat rule), swipeTo, markSeen,
// and dropOld, which returns the unsolved, seen items that fell off the back history,
// so the caller can log them as abandoned
```

## Definition of done

Phase 2 closes when every box below is ticked on a real phone.

- [ ] You can swipe forward through at least 30 puzzles, and back through the last 20, on the iPhone 13 Pro without a dropped frame in release mode.
- [ ] Swiping back restores each puzzle's board, notes, mistakes, undo history and time.
- [ ] Only Easy and Medium puzzles appear, in roughly an 80/20 mix (tested in code with a fixed random source).
- [ ] Solving shows the solved panel and the disappearing swipe label, and the feed waits for a swipe.
- [ ] A seen, unsolved puzzle that drops off the back history is logged as abandoned, with the right fields. A puzzle that was only loaded ahead of time isn't logged.
- [ ] Killing the app mid-feed and reopening it restores the current puzzle, the back history and the next puzzle.
- [ ] An unsolved Phase 1 save carries over as the first puzzle.
- [ ] Feed tests cover the difficulty mix, swiping both ways, the back-history limit, seen and abandoned, and saving and restoring.
- [ ] `npm run check` passes, and `uv run pytest` too if the pipeline changed.

## Build order

Same working rules as Phase 1: one task per session, plan first, a feature branch per task.

1. **Spec.** This file, finalized. Point `CLAUDE.md` at it.
2. **One store per puzzle.** Turn the global Sudoku store into one store per puzzle, with every Phase 1 test still passing.
3. **Feed model.** The pure feed module above, test-first: the 80/20 mix, the back history, seen and abandoned.
4. **Abandons in the results log.** The `abandoned` outcome, its check on load, and its tests.
5. **Swipe feed UI.** The vertical `FlatList`, the next puzzle drawn ahead, the solved label, and removing the band picker.
6. **Feed persistence.** Save and restore the feed and every seen puzzle, and carry over the Phase 1 save.
7. **Device pass.** On the iPhones, plus Android if one is available.

## Open questions

1. **Swipe direction and label wording.** In video feeds you bring in the next item by moving your finger up, which people call both "swipe up" and "scroll down". Should the label read "Swipe up for next puzzle" to match the gesture, or keep "Swipe down for next puzzle"?
2. **When an abandon is logged.** Proposed above: once the puzzle drops off the 20-puzzle back history, so a puzzle you return to and solve isn't counted as abandoned. The alternative is to log it the first time you swipe away unsolved, and also log a solve if you later finish it, which gives Phase 3's rating the result sooner but puts two entries in the log.
3. **The swipe label.** After every solve, or only for the first few solves until the player has learned the gesture?
4. **Back history length.** Is 20 puzzles right?
