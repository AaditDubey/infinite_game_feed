# Infinite Games

An infinite, swipeable feed of mini puzzle games. Phase 1 builds Sudoku end to end. The spec below is the source of truth: read it before planning, and if a request conflicts with it, stop and ask.

@docs/phase_1.md

## Commands

| Command                        | Purpose                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `npm run check`                | Typecheck, lint, format check, tests. Must pass before a task is done.            |
| `npm run format`               | Apply Prettier formatting.                                                        |
| `npx expo start`               | Dev server; open on the phone with Expo Go.                                       |
| `npx expo install <pkg>`       | Add a dependency at the SDK-matched version (`--dev` for dev tooling). Ask first. |
| `npx expo-doctor`              | Check that dependency versions match the SDK.                                     |
| `cd pipeline && uv run pytest` | Pipeline tests (from Task 2 on).                                                  |

## Working rules

The spec's "Rules for agents" section is authoritative. In short:

- One build-order task per session. Plan first and wait for approval.
- No new dependencies without asking. Never edit `assets/puzzles/` by hand.
- Game rules live only in `src/games/<game>/engine.ts`, written test-first. Components render and dispatch.
- Routes live in `src/app/`; all other app code lives elsewhere under `src/`.
- Don't guess APIs: use Context7, the SDK 57 docs at https://docs.expo.dev/versions/v57.0.0/, or https://docs.expo.dev/llms.txt.
- One feature branch per task, small commits, never commit to `main` or force-push.
- End each task with a plain-language explanation of any non-obvious code.

## Environment notes

- Expo SDK 57 is pinned until the store Expo Go moves to SDK 58. That upgrade is its own task.
- Node 24 LTS (`.nvmrc`). The owner's Mac is an Apple M4, but Homebrew is an Intel (x86_64) install in `/usr/local` that runs under Rosetta. Node is therefore the native arm64 nodejs.org build in `~/.local/opt/`, not Homebrew's. Check `node -p process.arch` prints `arm64` before installing packages; an x64 Node installs Intel builds of native modules.
- iOS Expo Go requires the same Expo account in `npx expo login` and in the Expo Go app.
- TypeScript 6 doesn't auto-include `@types` packages, so test globals come from `"types": ["jest"]` in `tsconfig.json`.
