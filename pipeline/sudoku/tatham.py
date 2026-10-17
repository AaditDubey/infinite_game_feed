"""Everything that touches Simon Tatham's Solo: params, game IDs and the built binaries.

Build the binaries first (see pipeline/README.md). Nothing here decides whether a
puzzle is good enough to ship; that's our own check in verify.py.
"""

import subprocess
from pathlib import Path

from sudoku.shape import SUDOKU_6X6, SUDOKU_9X9, Shape

PIPELINE = Path(__file__).resolve().parent.parent
PUZZLES_SOURCE = PIPELINE / "vendor/puzzles"
SOLO_GEN = PIPELINE / "out/build/solo-gen"
SOLOSOLVER = PIPELINE / "out/build/puzzles/solosolver"

# Solo grid params -> (our shape, the size label used in pack names).
GRIDS: dict[str, tuple[Shape, str]] = {
    "3x3": (SUDOKU_9X9, "9x9"),
    "2x3": (SUDOKU_6X6, "6x6"),
}

# (band, grade, Solo difficulty code): bands from docs/phase_1.md, codes from solo.c's
# decode_params(). Unreasonable ("du") needs guessing and is never used.
BANDS: list[tuple[int, str, str]] = [
    (1, "trivial", "dt"),
    (2, "basic", "db"),
    (3, "intermediate", "di"),
    (4, "advanced", "da"),
    (5, "extreme", "de"),
]

_FIRST_DIGITS = "123456789"
_DIGITS = "0123456789"


def params(grid: str, code: str) -> str:
    """Solo's params for a grid and difficulty code: params("3x3", "de") == "3x3de"."""
    if grid not in GRIDS:
        raise ValueError(f"unknown grid {grid!r}; expected one of {sorted(GRIDS)}")
    return grid + code


def parse_game_id(game_id: str, grid: str) -> str:
    """Turn a Solo game ID like '3x3:9a8f...' into a givens string ('0' = empty).

    Mirrors spec_to_grid() in solo.c: 'a'-'z' are runs of 1-26 empty cells, a run of
    digits is one number, and '_' separates two adjacent numbers. Anything else raises
    ValueError, including the jigsaw and killer sections that follow a ','.
    """
    if grid not in GRIDS:
        raise ValueError(f"unknown grid {grid!r}; expected one of {sorted(GRIDS)}")
    shape = GRIDS[grid][0]
    prefix, colon, desc = game_id.partition(":")
    if not colon:
        raise ValueError(f"game ID {game_id!r} has no ':'")
    if prefix != grid:
        raise ValueError(f"expected a {grid} game ID, got {prefix!r}")

    cells: list[str] = []
    i = 0
    while i < len(desc):
        ch = desc[i]
        if "a" <= ch <= "z":
            cells.extend("0" * (ord(ch) - ord("a") + 1))
            i += 1
        elif ch in _FIRST_DIGITS:
            end = i + 1
            while end < len(desc) and desc[end] in _DIGITS:
                end += 1
            number = int(desc[i:end])
            if number > shape.size:
                raise ValueError(f"given {number} is above {shape.size} in {game_id!r}")
            cells.append(str(number))
            i = end
        elif ch == "_":
            i += 1
        elif ch == ",":
            raise ValueError(f"jigsaw and killer game IDs aren't supported: {game_id!r}")
        else:
            raise ValueError(f"unexpected {ch!r} in game ID {game_id!r}")

    if len(cells) != shape.cells:
        raise ValueError(f"game ID has {len(cells)} cells; a {grid} grid has {shape.cells}")
    return "".join(cells)


def _run(binary: Path, *args: str) -> str:
    if not binary.exists():
        raise FileNotFoundError(
            f"{binary.relative_to(PIPELINE)} isn't built; see pipeline/README.md"
        )
    return subprocess.run([str(binary), *args], check=True, capture_output=True, text=True).stdout


def run_solo_gen(solo_params: str, count: int, seed: str) -> list[tuple[str, str]]:
    """Generate `count` puzzles; returns (seed ID, game ID) pairs in generation order."""
    pairs = []
    for line in _run(SOLO_GEN, str(count), solo_params, seed).splitlines():
        seed_id, tab, game_id = line.partition("\t")
        if not tab:
            raise ValueError(f"unexpected solo-gen output: {line!r}")
        pairs.append((seed_id, game_id))
    if len(pairs) != count:
        raise ValueError(f"solo-gen printed {len(pairs)} puzzles, expected {count}")
    return pairs


def solosolver_rating(game_id: str) -> str:
    """Tatham's grade for a game ID, from `solosolver -g`: 'Trivial', 'Basic', ..."""
    line = _run(SOLOSOLVER, "-g", game_id).strip()
    prefix = "Difficulty rating: "
    if not line.startswith(prefix):
        raise ValueError(f"unexpected solosolver output: {line!r}")
    return line.removeprefix(prefix).split(" ", 1)[0]


def puzzles_commit() -> str:
    """The commit of Tatham's source in vendor/puzzles."""
    return subprocess.run(
        ["git", "-C", str(PUZZLES_SOURCE), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
