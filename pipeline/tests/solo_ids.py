"""Shared helpers for tests that use the recorded Solo samples in tests/fixtures/."""

import json
from pathlib import Path

import pytest

from sudoku.shape import SUDOKU_6X6, SUDOKU_9X9

PIPELINE = Path(__file__).resolve().parent.parent
SOLO_GEN = PIPELINE / "out/build/solo-gen"
SOLOSOLVER = PIPELINE / "out/build/puzzles/solosolver"

# Solo grid params -> (fixture file, our shape).
GRIDS = {
    "3x3": ("solo_samples.json", SUDOKU_9X9),
    "2x3": ("solo_samples_2x3.json", SUDOKU_6X6),
}
FIXTURES = {
    grid: json.loads((PIPELINE / "tests/fixtures" / filename).read_text())
    for grid, (filename, _) in GRIDS.items()
}

# Every recorded puzzle as (grid, grade entry, sample), with readable test ids.
SAMPLES = [
    (grid, grade, sample)
    for grid, fixture in FIXTURES.items()
    for grade in fixture["grades"]
    for sample in grade["samples"]
]
SAMPLE_IDS = [sample["seedId"] for _, _, sample in SAMPLES]

needs_build = pytest.mark.skipif(
    not (SOLO_GEN.exists() and SOLOSOLVER.exists()),
    reason="solo-gen isn't built; see pipeline/README.md",
)


def decode_desc(desc: str) -> str:
    """Expand a Solo grid description into a givens string ('0' = empty).

    'a'-'z' are runs of 1-26 empty cells, each digit is one given (grids up to 9x9), and
    '_' only separates two adjacent givens. Task 4's tatham.py replaces this helper.
    """
    out = []
    for ch in desc:
        if "a" <= ch <= "z":
            out.append("0" * (ord(ch) - ord("a") + 1))
        elif ch.isdigit():
            out.append(ch)
        elif ch != "_":
            raise ValueError(f"unexpected {ch!r} in Solo grid description")
    return "".join(out)


def givens_of(sample: dict) -> str:
    """The givens string of a recorded sample's game ID, e.g. '3x3:9a8f...'."""
    return decode_desc(sample["gameId"].split(":", 1)[1])
