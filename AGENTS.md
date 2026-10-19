# Agent guide

Read `docs/phase_1.md` (the Phase 1 spec) and `docs/phase_2.md` (the Phase 2 spec, the swipe feed) before reviewing or changing anything. They are the source of truth, and their "Rules for agents" sections apply to every task. Where they disagree, `phase_2.md` wins for Phase 2 work.

## Review checklist

- `npm run check` passes (typecheck, lint, format check, tests). If `pipeline/` changed, `uv run pytest` passes too.
- Game rules live only in `src/games/<game>/engine.ts`, as pure functions. Components only render and dispatch.
- Every engine rule change comes with tests.
- Nothing under `assets/puzzles/` was edited by hand; packs come from the pipeline.
- No new dependency without the owner's approval. App packages are added with `npx expo install`.
- `src/feed/` stays game-agnostic: only `src/feed/games.ts` imports from `src/games/`.
- Nothing from the specs' out-of-scope lists.

## Expo has changed: don't trust training data

This project uses Expo SDK 58. Expo ships breaking changes every SDK release. Before writing or reviewing code that touches an Expo, EAS or React Native API, read the versioned docs at https://docs.expo.dev/versions/v58.0.0/, or start from https://docs.expo.dev/llms.txt. Don't answer from memory.

- Routes live in `src/app/`: every file there is a screen, and `_layout.tsx` files define navigators. Keep non-route code outside `src/app/`.
- `ios/` and `android/` are generated (Continuous Native Generation). Never create or edit them by hand; configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. A library with native code needs a development build.
- Use `npx expo install <package>` instead of `npm install <package>` so versions match the SDK.
