# Infinite Games

An infinite, swipeable feed of mini puzzle games. Phase 1 builds Sudoku end to end. The spec below is the source of truth: read it before planning, and if a request conflicts with it, stop and ask.

@docs/phase_1.md

## Commands

| Command                                                                                                                                     | Purpose                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run check`                                                                                                                             | Typecheck, lint, format check, tests. Must pass before a task is done.                         |
| `npm run format`                                                                                                                            | Apply Prettier formatting.                                                                     |
| `npx expo start`                                                                                                                            | Dev server; open on the phone with Expo Go.                                                    |
| `npx expo install <pkg>`                                                                                                                    | Add a dependency at the SDK-matched version (`--dev` for dev tooling). Ask first.              |
| `npx expo-doctor`                                                                                                                           | Check that dependency versions match the SDK.                                                  |
| `cd pipeline && uv run pytest`                                                                                                              | Pipeline tests. Binary tests skip until `solo-gen` is built.                                   |
| `cd pipeline && uv run ruff check . && uv run ruff format --check .`                                                                        | Python lint and format.                                                                        |
| `cd pipeline && uv run cmake -S gen -B out/build -DCMAKE_BUILD_TYPE=Release && uv run cmake --build out/build --target solo-gen solosolver` | Build the generator (see `pipeline/README.md`).                                                |
| `cd pipeline && uv run python -m sudoku.build_pack --grid 3x3 --per-band 100 --out ../assets/puzzles/sudoku/pack-9x9-001.json`              | Rebuild the 9×9 pack (`--grid 2x3` and `pack-6x6-001.json` for 6×6). Never edit packs by hand. |
| `git submodule update --init`                                                                                                               | Fetch Tatham's source into `pipeline/vendor/puzzles` after cloning.                            |

## Working rules

The spec's "Rules for agents" section is authoritative. In short:

- One build-order task per session. Plan first and wait for approval.
- No new dependencies without asking. Never edit `assets/puzzles/` by hand.
- Game rules live only in `src/games/<game>/engine.ts`, written test-first. Components render and dispatch.
- Routes live in `src/app/`; all other app code lives elsewhere under `src/`.
- Don't guess APIs: use Context7, the SDK 58 docs at https://docs.expo.dev/versions/v58.0.0/, or https://docs.expo.dev/llms.txt.
- One feature branch per task, small commits, never commit to `main` or force-push.
- End each task with a plain-language explanation of any non-obvious code.

## Environment notes

- Expo SDK 58. The store Expo Go runs only its current SDK, so the phones need its SDK 58 build. Moving to a later SDK is its own task.
- Node 24 LTS (`.nvmrc`). SDK 58 doesn't support odd-numbered Node versions, so Homebrew's Node 25 won't work at all. The owner's Mac is an Apple M4, but Homebrew is an Intel (x86_64) install in `/usr/local` that runs under Rosetta. Node is therefore the native arm64 nodejs.org build in `~/.local/opt/`, not Homebrew's. Check `node -p process.arch` prints `arm64` before installing packages; an x64 Node installs Intel builds of native modules.
- uv is the native arm64 release in `~/.local/bin`, which comes before Homebrew's x86_64 uv on PATH. Its Python is 3.13 arm64. Check that `uv run python -c 'import platform; print(platform.machine())'` prints `arm64`. A plain `uv python install 3.13` reuses the old x86_64 download, so request `cpython-3.13-macos-aarch64-none` explicitly.
- Never use Solo's Unreasonable grade, and always pass `solo-gen` a seed (see `pipeline/README.md`).
- iOS Expo Go requires the same Expo account in `npx expo login` and in the Expo Go app.
- TypeScript 6 doesn't auto-include `@types` packages, so test globals come from `"types": ["jest"]` in `tsconfig.json`.
- Metro reads the `@/` path aliases from `tsconfig.json`, but Jest doesn't, so `moduleNameMapper` in `package.json`'s `jest` block repeats them. Keep the two in sync, with `@/assets/*` listed before `@/*`.
