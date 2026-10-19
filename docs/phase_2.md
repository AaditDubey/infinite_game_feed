# Infinite Games App: Phase 2 Spec (Swipe feed)

Oct 19, 2026 · @Aadit Dubey

Phase 2 turns Phase 1's single Sudoku screen into an endless vertical feed of Sudoku puzzles that you swipe through, forward and back. This file lives at `docs/phase_2.md` and is the reference Claude Code works from. It builds on `docs/phase_1.md`, which still applies wherever this file doesn't say otherwise: the stack, the pipeline, the Sudoku rules, the quality bar and the rules for agents.

## Context and scope

The feed is the heart of the app: one puzzle per screen, swipe to the next, swipe back to an earlier one. Phase 2 builds it with Sudoku only, in both sizes, but the feed itself knows nothing about Sudoku beyond one mapping file, so Rectangles and Queens slot in during Phase 3 without changing the feed.

**In scope:**

- the vertical feed, with the next puzzle drawn before you reach it;
- swiping back through the last 20 puzzles;
- a fixed Easy and Medium mix;
- abandons in the results log;
- saving the whole feed, so closing the app loses nothing;
- carrying over a Phase 1 game in progress.

**Out of scope for Phase 2:** other games, adaptive difficulty and its benchmarks, the cooldown that clears abandoned puzzles (Phase 2 only records what it needs), player ratings, streaks, the daily set, accounts or any backend, analytics, crash reporting, ads, subscriptions, sound, and visual polish. If a task seems to need one of these, stop and ask.

**Prerequisite:** the Expo SDK 58 upgrade (PR #11) is merged, after its check on the phones with the App Store's SDK 58 Expo Go.

## Tech stack

Phase 2 installs nothing new. Every Phase 1 choice stays; these rows change or are added.

### App (Phase 2)

| Layer | Choice | Notes |
| --- | --- | --- |
| Feed | React Native's built-in `FlatList`, vertical, snapping to one puzzle per screen | `FlatList` keeps only the puzzles near the current one mounted, so the feed can grow without slowing down. If it can't meet the quality bar on a phone, stop and ask before trying `react-native-pager-view` or a custom pager on Reanimated and Gesture Handler. |
| State | Zustand: one store per puzzle in the feed, plus one feed store | Phase 1 has one global Sudoku store, so only one board can exist. The feed draws the current board and the next one at the same time, so each puzzle gets its own store, made with Zustand's `createStore` and read through a React context with `useStore(store, selector)`. A tap re-renders only its own puzzle. |
| Animation | Reanimated | Also fades the swipe label in and out. |
| Persistence | AsyncStorage, as in Phase 1 | New keys for the feed and for each puzzle in it; see Persistence. |

### Later phases (not now)

| Phase | Adds |
| --- | --- |
| 3 | `@shopify/react-native-skia` for Rectangles and Queens in the feed; on-device Glicko-2 player rating; adaptive difficulty once its benchmarks are set; streaks; daily set |
| 4 | PostHog analytics, Sentry crash reports, share card, onboarding; Maestro end-to-end tests |
| 5 | EAS Build, Submit and Update; TestFlight and the Play closed test; the Android device pass Phase 1 skipped, before the Play closed test |
| After launch | RevenueCat and AdMob (`react-native-google-mobile-ads`); Supabase for percentiles, age cohorts and friends |

## Repository layout

New and changed files only. Everything else stays where Phase 1 put it.

```
src/
├── app/
│   ├── _layout.tsx             # unchanged: holds the splash screen
│   └── index.tsx               # Phase 2: the feed screen
├── feed/
│   ├── feed.ts                 # pure feed rules: items, current, seen, back history, what to drop
│   ├── feed.test.ts
│   ├── difficulty.ts           # pickBand: the 80/20 Easy and Medium mix
│   ├── difficulty.test.ts
│   ├── paging.ts               # pure helpers: which page the list settled on, page offsets
│   ├── paging.test.ts
│   ├── games.ts                # the one place that maps a game kind to its source, store and page
│   ├── store.ts                # Zustand feed store: wraps feed.ts, owns each puzzle's store
│   ├── store.test.ts
│   ├── useFeedLifecycle.ts     # restore on launch, splash screen, app background and foreground
│   └── components/
│       ├── Feed.tsx            # the vertical FlatList
│       └── SwipeHint.tsx       # the disappearing "Swipe up for next puzzle" label
├── games/
│   └── sudoku/
│       ├── engine.ts           # unchanged
│       ├── source.ts           # the bundled catalog and the play history: picks puzzles, marks solves
│       ├── source.test.ts
│       ├── store.ts            # createSudokuStore: one store per puzzle in the feed
│       ├── store.test.ts
│       ├── context.tsx         # SudokuStoreProvider and useSudoku(selector)
│       ├── SudokuPage.tsx      # one feed page: top bar, board, then pad and toolbar or solved panel
│       └── components/         # BandPicker removed; SolvedPanel loses its button
└── storage/
    ├── persistence.ts          # adds the feed, per-puzzle saves, abandons and the Phase 1 carry-over
    └── persistence.test.ts
```

Removed:

- `src/games/sudoku/useBackgroundPause.ts` and `useRestore.ts`: `src/feed/useFeedLifecycle.ts` takes over both jobs.
- `src/games/sudoku/components/BandPicker.tsx`.

## App behavior

Phase 2 is one screen: the feed. Every page in it is a full puzzle screen. Taps must feel as instant as in Phase 1, swipes must follow the finger, and closing the app anywhere must lose nothing.

### A feed page

- **Top bar:** band label (Easy or Medium), the timer, the mistake count. Same as Phase 1, without the band picker.
- **Board, number pad, toolbar:** exactly as in Phase 1, with the same rules table. Each page has its own selection, Notes toggle, undo history, mistakes and timer.
- **Solved:** the number pad and toolbar give way to the solved panel, as in Phase 1: the time and the mistake count. It has no "Next puzzle" button, because the swipe replaces it.
- **Swipe label:** see Solving.
- **Page size:** a page fills the feed exactly, from below the status bar to the bottom safe area. Exactly one page shows at rest.

### Feed rules

| Event | Behavior |
| --- | --- |
| First launch ever | The feed starts with one puzzle, picked by the difficulty mix, and settles on it. A Phase 1 game in progress is carried over instead (see Persistence). |
| Swipe forward or back | The feed follows the finger and settles on the next or previous page. One swipe moves exactly one page, however fast it is. There's nothing before the oldest page in the back history. |
| The feed settles on a page | The page you left pauses its timer, saves, and records when you left (`leftAt`). The page you landed on becomes current: it's marked seen and its timer runs. A forward swipe counts toward learning the gesture. If it's the newest page, the next puzzle is picked and drawn below it straight away. If more than 20 seen pages are now behind the current one, the oldest leave the feed (see Back history). |
| A move on the current page | Phase 1's rules. The page saves after every move. |
| Solve | Phase 1's rules: the timer stops, input locks, the solve is logged, and the puzzle counts as played. The swipe label appears if the gesture isn't learned yet. The feed doesn't move. |
| Swipe back to a solved page | It shows the solved board and the solved panel. The label doesn't appear again. |
| Swipe back to an unsolved page | It's exactly as you left it: digits, notes, mistakes, undo history and time. Its timer resumes, and you can finish it. |
| App goes to the background | Phase 1's rules, for the current page only: its timer pauses and it saves. iOS's brief inactive state saves without pausing. |
| App returns | The current page's timer resumes, unless it's solved. |
| App killed and reopened | The feed reopens on the same page, with the same back history and the same next puzzle waiting. |

### Seen, timers and the back history

- **Seen:** a page counts as seen once the feed settles on it as the current page. The puzzle drawn ahead isn't seen until you land on it. With one page per swipe, every page behind the current one has been seen.
- **Timer:** each page's timer starts the first time the page is seen. It runs only while that page is current and the app is in the foreground. Time spent on other pages, or in the background, doesn't count.
- **Back history:** the feed keeps the 20 most recent seen pages behind the current one. When a 21st would be added, the oldest leaves the feed for good:
  - If it's unsolved, it's logged as abandoned, and the play history records when (see Difficulty).
  - Its save is deleted.
  - The current page must not move on screen when pages leave the top of the list.
- **Ahead:** exactly one unseen page is ready below the current one (`AHEAD = 1`). If the device pass shows a half-drawn page after a quick double swipe, raise it to 2. That's a constant, not a spec change.

### Solving and the swipe label

- The feed never moves by itself.
- When a puzzle becomes solved and the gesture isn't learned yet, a label fades in at the bottom of the page: "Swipe up for next puzzle". After 3 seconds it fades out. It sits over the bottom of the page and doesn't block touches.
- It appears only at the moment of solving: not when you swipe back to a solved page, and not after a restart on a solved page.
- **Learning the gesture:** it counts as learned after the player's third forward swipe, that is, three times the feed settles on a later page than the one before. Back swipes don't count. Swipes that come before any solve do count, because they show the player already knows the gesture. From then on the label never appears.
- The count is part of the saved feed, so it survives restarts. If the saved feed is unreadable and a fresh feed starts, the count starts over and the label shows for a few more solves. That's harmless.
- Screen readers announce it once when it appears. Check the right API in the React Native docs for iOS and Android.
- Colors and text size come from `theme.ts`.

### Difficulty

- Each new page is Easy (band 1) with probability 0.8, and Medium (band 2) with probability 0.2. `pickBand` takes the random source, so tests can fix it.
- Within the band, Phase 1's rules pick the puzzle: a random size among those with unplayed puzzles, then the next unplayed puzzle of that size in pack order after the last one served, with no solved puzzle repeating until the whole band has been solved.
- A puzzle counts as served when it's picked as the next page, even before it's seen. An abandoned puzzle stays unplayed, so it comes round again after the rest of its band and size.
- **Clearing abandoned puzzles, later.** The plan is to hold an abandoned puzzle back for a while, then clear it so it can be served again. That cooldown is built later, as its own task. Until then the rule above applies. Phase 2 only records what the cooldown needs, so it won't need a data migration:
  - The play history gains `abandonedAt`: each abandoned puzzle's id, mapped to when it was last abandoned (ms since 1970). An abandon sets the entry; a solve removes it.
  - A play history saved by Phase 1, which has no `abandonedAt`, loads with no abandons.
  - Only `pick` will change: it will skip puzzles that are still cooling down.
  - Decided with that task: how long the cooldown lasts, and what to serve when every unplayed puzzle in a band is cooling down.
- Bands 3 to 5 stay in the packs, unused, until adaptive difficulty arrives.
- Supply: 200 Easy and 200 Medium puzzles across both sizes. At 10 solves a day (8 Easy), Easy runs out after about 25 days and starts over. A second pack (`pack-9x9-002.json`, `pack-6x6-002.json`) can come from the pipeline whenever it's needed.
- The benchmarks for adaptive difficulty (what counts as fast, slow or too many mistakes) are decided later. Phase 2 only records the results they need: every solve and every abandon.

### Results log

- Solves are logged as in Phase 1.
- Abandons use the same entry with `outcome: 'abandoned'`:

  ```json
  {
    "outcome": "abandoned",
    "puzzleId": "sudoku-6x6-001-0042",
    "size": 6,
    "band": 1,
    "at": 1792400000000,
    "elapsedMs": 48000,
    "mistakes": 1
  }
  ```

- `at` is when the player last left the page (`leftAt`). `elapsedMs` and `mistakes` are totals across every visit.
- The same `at` goes into the play history's `abandonedAt` (see Difficulty).
- Each appearance of a puzzle in the feed gets exactly one entry: solved or abandoned.
  - A page you return to and solve is logged only as solved.
  - A page drawn ahead but never seen gets no entry.
- An unsolved page still in the back history isn't logged yet, because you can still go back and finish it.
- The log stays one JSON list under `v1:sudoku:results`. Phase 1's known limit stands: Phase 3 may need to split it.

### Persistence

**Keys.** All keys keep the `v1:` prefix.

| Key | Contents | Written |
| --- | --- | --- |
| `v1:feed` | The feed: its pages, the current one, the next page id, and the forward swipe count | When the feed settles, when a page is added and when pages leave |
| `v1:sudoku:game:<pageId>` | One page's game, in Phase 1's saved-game format | After every move on that page, when you leave it, and when the app leaves the screen |
| `v1:sudoku:playHistory` | Phase 1's no-repeat state, plus `abandonedAt` | When a puzzle is picked, solved or abandoned |
| `v1:sudoku:results` | The results log | On each solve and abandon |

The feed is saved like this:

```json
{
  "items": [
    {
      "id": "page-41",
      "game": "sudoku",
      "puzzleId": "sudoku-6x6-001-0007",
      "band": 1,
      "seen": true,
      "leftAt": 1792400000000
    }
  ],
  "current": 20,
  "nextId": 43,
  "forwardSwipes": 3
}
```

**Page ids.** Each page has its own id (`page-<n>`, never reused), separate from the puzzle id. Saves are stored by page id, so two appearances of the same puzzle never share a save.

**Each move writes only its page.** About 4 KB, as in Phase 1, never the whole feed. A full back history takes about 100 KB, and at most about 1 MB in the worst case Task 9 measured (47 KB per page).

**On launch:**

- Load the feed, every page's save and the play history behind the splash screen, as Phase 1 does.
- Then reopen on the current page.
- Make sure one unseen page is waiting ahead.

**Bad or stale data never stops the app from opening:**

- An unreadable feed starts a fresh feed. The play history and results log are kept.
- A page whose puzzle is no longer in the packs is dropped, without a log entry.
- A seen page whose save is unreadable starts again from its givens.
- A save key with no page in the feed (left over from a crash) is deleted.

**Carrying over Phase 1:**

- If there's no `v1:feed` but there is an unsolved `v1:sudoku:game`, that game becomes the first page, already seen, with its time and mistakes. The old key is then removed.
- A solved Phase 1 game isn't carried over.
- The play history and results log carry on unchanged.

### Edge cases

| Situation | Behavior |
| --- | --- |
| Swiping back past the oldest page | The list stops there. |
| Swiping again before the next page has finished drawing | The page appears as soon as it's drawn, and the feed never shows a page from another puzzle. If it happens on the iPhone 13 Pro, raise `AHEAD`. |
| Tapping the status bar | Does nothing. On iOS a scroll view jumps to the top when the status bar is tapped; the feed turns that off. |
| Swiping away during the swipe label | The label goes with its page and doesn't come back. |
| The app goes to the background mid-swipe | Whichever page the feed settles on becomes current, and its timer follows the background rules. |
| A band is fully solved | It starts over, as in Phase 1. |
| The same puzzle served twice within the back history | Allowed, though unlikely (it needs a band to run out and start over). Each page has its own id and save. |

## Design

As in Phase 1, the rules live in pure TypeScript modules with no React, no storage and no clock. Callers pass in the time and the random source, and Jest tests every rule. Stores call the pure modules; components read stores and contain no rules.

### Feed module (`src/feed/feed.ts`)

```ts
export type GameKind = 'sudoku'; // Phase 3 adds 'rectangles' and 'queens'

export interface FeedItem {
  id: string;            // 'page-<n>', never reused; keys this page's save
  game: GameKind;
  puzzleId: string;
  band: Band;
  seen: boolean;         // the feed has settled on it at least once
  leftAt: number | null; // when the player last swiped away from it, ms since 1970
}

export interface FeedState {
  items: FeedItem[]; // oldest first: the back history, the current page, then the pages ahead
  current: number;   // index into items
  nextId: number;    // the number in the next page's id
  forwardSwipes: number; // settles on a later page; stops counting at LEARNED_AFTER
}

export const BACK_HISTORY = 20; // seen pages kept behind the current one
export const AHEAD = 1;         // unseen pages kept ready below the current one
export const LEARNED_AFTER = 3; // forward swipes after which the swipe label stops

// createFeed(first, now): a feed of one page, already seen
// append(state, { game, puzzleId, band }): adds an unseen page at the end
// settleOn(state, index, now): marks the page seen, records leftAt on the page left,
//   counts a forward swipe, and returns { state, dropped }: the pages that fell off the back history
// missingAhead(state): how many pages to append to keep AHEAD pages ready
// gestureLearned(state): forwardSwipes has reached LEARNED_AFTER
```

The feed module never knows whether a page is solved. The feed store asks each dropped page's game store, and logs the unsolved ones as abandoned.

### Difficulty (`src/feed/difficulty.ts`)

```ts
export const BAND_MIX = [
  { band: 1, weight: 0.8 },
  { band: 2, weight: 0.2 },
] as const;

export function pickBand(random: () => number): Band; // random() in [0, 1): below 0.8 is Easy
```

### Sudoku source (`src/games/sudoku/source.ts`)

This holds the bundled catalog and the play history, which until now lived inside Phase 1's store.

- `pick(band, random)` uses Phase 1's `pickNextPuzzle` and saves the play history.
- `markSolved(puzzleId)` records a solve, removes the puzzle from `abandonedAt`, and saves the play history.
- `markAbandoned(puzzleId, at)` sets the puzzle's `abandonedAt` and saves the play history.
- `find(puzzleId)` looks a puzzle up for restoring.

It's loaded once at launch, before the feed.

### One store per puzzle (`src/games/sudoku/store.ts`)

```ts
export function createSudokuStore(init: {
  pageId: string;
  game: GameState;   // fresh from createGame, or restored from its save
  elapsedMs: number; // play time so far
}): StoreApi<SudokuState>;
```

- `SudokuState` keeps Phase 1's state (`game`, `timer`, `selected`, `notesMode`, `flash`) and its moves (`select`, `inputDigit`, `eraseSelected`, `undo`, `toggleNotesMode`).
- `nextPuzzle`, `chooseBand`, `restore` and the global `ready` flag move to the feed.
- New actions:
  - `activate(now)`: the page became current, or the app came back. The timer runs unless the game is solved.
  - `deactivate(now)`: the page was left, or the app went to the background. The timer pauses and the game saves.
  - `saveNow()`: saves without pausing, for iOS's inactive state.
- On a solve, the store stops the timer, logs the solve, and calls the Sudoku source's `markSolved`. It sets a `justSolved` flag, and the page shows the swipe label if the feed says the gesture isn't learned yet.
- Saving works as in Task 9: a store subscription saves the game whenever a move or the timer changes it, under the page's key.
- `context.tsx` provides each page's store to its components. Phase 1's components change one line each: `useSudokuStore(selector)` becomes `useSudoku(selector)`.

### Feed store (`src/feed/store.ts`)

One app-wide Zustand store.

- It holds `ready`, the `FeedState` and each page's game store, created when a page is added and thrown away when it leaves.
- `restore()` loads everything at launch, carries over a Phase 1 game, and makes sure a page is waiting ahead.
- `settleOn(index)` deactivates the page left and activates the page reached. It picks new pages through `pickBand` and the game's source. For each dropped unsolved page it logs an abandon and calls the source's `markAbandoned`. It deletes dropped pages' saves and saves the feed.
- `pauseCurrent`, `resumeCurrent` and `saveCurrentNow` serve the app lifecycle hook.
- `Feed.tsx` passes each page whether the gesture is learned, so the page knows whether `justSolved` shows the swipe label.

`src/feed/games.ts` maps `'sudoku'` to the Sudoku source, `createSudokuStore` and `SudokuPage`. It's the only file under `src/feed/` that imports from `src/games/`.

### The feed list (`src/feed/components/Feed.tsx`)

Start with these `FlatList` settings, all checked in React Native's docs, and confirm them on a phone:

| Need | Setting |
| --- | --- |
| One page per screen | Measure the list's height with `onLayout`. Every page is that tall. `getItemLayout` returns `height × index`, which `initialScrollIndex` also requires. |
| One page per swipe | `snapToInterval={height}`, `snapToAlignment="start"`, `decelerationRate="fast"`, `disableIntervalMomentum`. These are documented for vertical lists, unlike `pagingEnabled`, which describes horizontal paging. |
| Knowing where it settled | `onMomentumScrollEnd`, with the offset turned into a page index by `paging.ts`. Check that it fires on both a slow drag and a fling. |
| Reopening on the right page | `initialScrollIndex={current}` |
| Pages leaving the top without a jump | `maintainVisibleContentPosition={{ minIndexForVisible: 0 }}`. If the page still jumps on a phone, scroll back to the current page without animation after the drop. Never reorder the list: the docs warn that reordering with this setting causes jank. |
| Only nearby pages mounted | Keep `windowSize` small (for example 3) and render one page at first. Tune both in release mode. Don't use `removeClippedSubviews`, which the docs warn can drop content. |
| Status bar tap does nothing | `scrollsToTop={false}` |
| No scroll bar | `showsVerticalScrollIndicator={false}` |
| Stable pages | `keyExtractor` returns the page id. Each page is wrapped in `React.memo`, so swiping doesn't redraw boards. |

If `viewabilityConfig` is used, define it once outside the component: the docs say it can't change after the first render.

## Quality bar

- Everything in Phase 1's quality bar still holds: portrait, phones only, light theme, every color from `theme.ts`, cell accessibility labels.
- Swiping follows the finger, moves exactly one page, and drops no frames on the iPhone 13 Pro in release mode (`npx expo start --no-dev --minify`).
- The next page is fully drawn before it comes into view.
- Taps stay as instant as in Phase 1. A tap never moves the feed, and a swipe that starts on the board, number pad or toolbar never places a digit or a note.
- Pages that aren't current don't redraw when you play on the current one.
- VoiceOver users can move between puzzles with the standard three-finger swipe, and hear the swipe label. Check this on the iPhone.
- Android is checked when an Android phone is available, together with Phase 1's skipped Android pass.

## Testing

- **Pure modules, written test-first:**
  - `feed.ts`: settling forward and back, seen and `leftAt`, the 20-page limit, what's dropped, keeping pages ahead, and the forward swipe count (back swipes don't count; it stops at `LEARNED_AFTER`).
  - `difficulty.ts`: the 80/20 split with a fixed random source, and no band outside 1 and 2.
  - `paging.ts`: offsets to page indices, including in-between offsets.
- **Stores, with persistence mocked as in Phase 1:**
  - `source.test.ts`: picking with the no-repeat rule, marking solves, and marking abandons (a later solve removes the entry).
  - The Sudoku `store.test.ts`: Phase 1's tests ported to `createSudokuStore`, plus activate, deactivate, `saveNow` and `justSolved`.
  - The feed `store.test.ts`: restore, settling, abandons logged only for dropped unsolved pages, and the timer of only the current page running.
- **Persistence, with AsyncStorage's Jest mock:** the feed round trip, per-page saves, bad and stale data, deleting leftover save keys, abandoned entries, `abandonedAt`, a Phase 1 play history without it, and the Phase 1 carry-over.
- **No component tests.** They'd need React Native Testing Library, a new dependency, so ask first. Keep logic out of components so it's tested elsewhere. The swipe itself is checked on the phone.

## Commands and checks

Same as Phase 1. A task is done only when `npm run check` passes, plus `uv run pytest` if the pipeline changed. For anything about speed, check in release mode: `npx expo start --no-dev --minify`.

## Definition of done

Phase 2 closes when every box below is ticked on a real phone, not a simulator.

- [ ] Swipe forward through at least 30 puzzles and back through the last 20 on the iPhone 13 Pro, in release mode, with no dropped frames and one page per swipe.
- [ ] Swiping back restores each page's board, notes, mistakes, undo history and time, and an unsolved one can be finished.
- [ ] Only Easy and Medium puzzles appear. The 80/20 mix is tested in code with a fixed random source.
- [ ] Solving shows the solved panel, and the feed waits for a swipe. The disappearing swipe label shows on solves until the third forward swipe, then never again, even after a restart.
- [ ] A seen, unsolved page that leaves the back history is logged as abandoned with the right fields, and its time is recorded in the play history's `abandonedAt`. A page drawn ahead but never seen isn't logged. A page solved after swiping back is logged only as solved.
- [ ] Killing the app mid-feed and reopening it restores the current page, the back history and the page waiting ahead.
- [ ] A Phase 1 game in progress carries over as the first page.
- [ ] Each page's timer counts only while it's current and the app is in the foreground.
- [ ] `npm run check` passes, and `uv run pytest` too if the pipeline changed.
- [ ] No new dependencies were added without approval, and no file in `assets/puzzles/` was edited by hand.

## Build order

Run each task as its own plan-mode session, on its own branch, and commit when it passes its checks.

0. **SDK 58.** Merge PR #11 after its phone check. Every task below starts from SDK 58. The phone check passed on Oct 19.
1. **Spec.** Answer the open questions and finalize this file. Point `CLAUDE.md` at it alongside `phase_1.md`. Update `phase_1.md`'s later phases table to match the one here. Done on Oct 19.
2. **One store per puzzle.** Add `createSudokuStore`, the context and `useSudoku`, and move the catalog and play history into `source.ts`. The app still shows one puzzle and behaves exactly as in Phase 1, and every Phase 1 test passes after porting.
3. **Feed rules.** `feed.ts`, `difficulty.ts` and `paging.ts`, test-first. No UI.
4. **Abandons in the results log and play history.** The `abandoned` outcome, its check on load, `abandonedAt` with `markAbandoned`, and tests. Phase 1's results and play history still load.
5. **Feed store.** Wire the feed rules, the Sudoku source and the per-puzzle stores together, in memory only, with tests: settling, pages ahead, dropping and abandons, and timers.
6. **Swipe feed UI.**
   - `Feed.tsx` with the settings above, `SudokuPage`, `SwipeHint` and the lifecycle hook.
   - Remove the band picker and the "Next puzzle" button.
   - Check it on a phone in release mode before moving on.
7. **Feed persistence.** Save and restore the feed and every page, clean up bad and stale data, and carry over the Phase 1 game.
8. **Device pass.** Play through the definition of done on the iPhones, plus Android if one is available.

If the swipe UI hits trouble in Task 6, tasks 3 to 5 still stand on their own, because they're pure logic and stores.

## Rules for agents

Phase 1's rules for agents apply to every Phase 2 task. In addition:

- `src/feed/` stays game-agnostic. Only `src/feed/games.ts` imports from `src/games/`.
- The Sudoku engine doesn't change in Phase 2. If a task seems to need a rule change, stop and ask; if approved, the change is test-first.
- No new libraries: no pager, gesture or testing library, without asking first.
- Every speed claim is checked in release mode on a phone, not in dev mode.
- If this spec and `phase_1.md` disagree, this file wins for Phase 2 work. Say so in the plan.
