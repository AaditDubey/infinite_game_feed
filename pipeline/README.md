# Puzzle pipeline

Generates Sudoku puzzles with Simon Tatham's Solo, verifies them with our own solver, and writes the JSON packs in `assets/puzzles/`. This file records what Task 2 (the Tatham spike) found; the spec is `docs/phase_1.md`.

## Generator source

- `vendor/puzzles` is a git submodule of `https://git.tartarus.org/simon/puzzles.git`, pinned at `616da16f25da428ccda805536209095bd062676e` (2026-09-23). MIT licence: `vendor/puzzles/LICENCE`.
- After cloning the repo, fetch it with `git submodule update --init`.
- The tartarus web view returns 403 to scripts, but git access works.

## Why `solo-gen` exists

Solo's `--generate` option lives only in Tatham's GTK frontend (`gtk.c`). On macOS, his CMake always builds the Cocoa app instead (`cmake/setup.cmake` picks `cmake/platforms/osx.cmake`), and that app has no `--generate`.

`gen/solo_gen.c` is a small command-line frontend that runs the same loop as `gtk.c`'s `--generate`:

- It parses `<params>#<seed>` with `midend_game_id`, then calls `midend_new_game`.
- Item 0 uses the seed as given; item `i > 0` appends `-<i>`.
- It links against `nullfe.c` (Tatham's no-op frontend) and the submodule's `common` library.

**The seed is required.** `nullfe.c`'s `get_random_seed()` always returns the same seed, so without an explicit one every run would print the same puzzles.

The same build also produces Tatham's `solosolver`. Its `-g` option grades a game ID, which gives us an independent check of each puzzle's grade.

## Build

From `pipeline/`. Tools come from uv: cmake is a dev dependency, Python is 3.13 arm64.

```sh
uv sync
uv run cmake -S gen -B out/build -DCMAKE_BUILD_TYPE=Release
uv run cmake --build out/build --target solo-gen solosolver
```

- This produces `out/build/solo-gen` (arm64) and `out/build/puzzles/solosolver` (universal), both gitignored.
- Tatham's `osx.cmake` requires Halibut, which only builds the Cocoa app's help pages. `gen/CMakeLists.txt` points it at `/usr/bin/false`, because that target is never built.

## Usage

```sh
out/build/solo-gen <n> <params> <seed>     # one "<seed id>\t<game id>" line per puzzle
out/build/puzzles/solosolver -g <game id>  # "Difficulty rating: Extreme (...)"
```

```
$ out/build/solo-gen 2 3x3dt smoke
3x3#smoke	3x3:d6_5a7_9a5c3e7_2b5a1_6_1b8h5h9b8_4_4a6b1_8e9c2a5_3a6_2d
3x3#smoke-1	3x3:9_2_6a8_1_5c5a2g1a4e9b3d8_4e5_7d5b6e9a8g5a3c2_7_1a9_4_5
```

## Bands, grades and params

The grade names in `solo.c` match the spec's bands one to one. `3x3` means a 9×9 grid of 3×3 boxes. The default symmetry is `r2` (180° rotational).

| Band | App label | Solo grade   | Params  | Seed IDs start with |
| ---- | --------- | ------------ | ------- | ------------------- |
| 1    | Easy      | Trivial      | `3x3dt` | `3x3#`              |
| 2    | Medium    | Basic        | `3x3db` | `3x3db#`            |
| 3    | Hard      | Intermediate | `3x3di` | `3x3di#`            |
| 4    | Expert    | Advanced     | `3x3da` | `3x3da#`            |
| 5    | Master    | Extreme      | `3x3de` | `3x3de#`            |

- Unreasonable (`3x3du`) needs guessing and is never used.
- Solo leaves default settings out when it writes params, which is why Trivial's seed IDs start with plain `3x3#`.
- `new_game_desc` keeps generating until a puzzle grades *exactly* at the requested level. `solosolver -g` agreed on all 25 samples.

## Game ID format

A game ID is `3x3:<desc>`. The `3x3:` prefix leaves out the grade, while the seed ID keeps it. `<desc>` lists the 81 cells row by row:

- `a`–`z`: a run of 1–26 empty cells.
- `1`–`9`: one given.
- `_`: separates two adjacent givens, and means nothing else.
- Standard 9×9 has no `,` section; that's only for jigsaw and killer variants.

Worked example: the fixture's first Trivial puzzle.

```
3x3:9a8f1a2a9a5_6_4a7_5_3b1d...
9 a 8 f          -> 9 . 8 . . . . . .   row 1: 908000000
1 a 2 a 9 a 5_6_4 -> 1 . 2 . 9 . 5 6 4   row 2: 102090564
a 7_5_3 b 1 d...  -> . 7 5 3 . . 1 . .   row 3: 075300100 (the d's last two blanks start row 4)
```

The whole description expands to the 81-character givens string the pack uses: `908000000102090564075300100006050002000701000700060800001009680567030209000000301` (32 clues).

## Determinism

- The same commit, params and seed always give byte-identical output; the tests regenerate the whole fixture to prove it.
- Different seeds give different puzzles.
- For Task 4, use a distinct seed per band and batch (for example `pack-001-band5`), and cache the output in `out/raw/`.

## Speed

Measured on the M4, native arm64, single process:

| Grade        | 5 puzzles | 100 puzzles |
| ------------ | --------- | ----------- |
| Trivial      | 0.02 s    | 0.03 s      |
| Basic        | 0.02 s    | 0.03 s      |
| Intermediate | 0.02 s    | 0.52 s      |
| Advanced     | 0.11 s    | 2.78 s      |
| Extreme      | 0.12 s    | 1.07 s      |

A 500-puzzle pack takes a few seconds, so parallel processes per band are optional.

## Recorded samples and tests

- `scripts/record_solo_samples.py` writes `tests/fixtures/solo_samples.json`: 5 IDs per grade from seeds `task2-<grade>`. It refuses to write the file unless `solosolver -g` agrees with every grade.
- `uv run pytest` checks:
  - the bands and params;
  - the game ID format (81 cells, at least 17 givens);
  - the seed scheme;
  - that the same seed regenerates the fixture exactly;
  - `solosolver`'s grades.

  The binary tests skip until `solo-gen` is built.
- Lint and format: `uv run ruff check . && uv run ruff format --check .`

## Backup: Docker

If the native build ever breaks, Ubuntu's `sgt-puzzles` package has the GTK frontend:

```sh
sgt-solo --generate 5 '3x3de#seed'
```

It works without a display, but runs Debian's packaged version rather than the pinned commit. Its loop is the one `solo-gen` copies, so it uses the same seed scheme. Matching output across the two hasn't been tested.
