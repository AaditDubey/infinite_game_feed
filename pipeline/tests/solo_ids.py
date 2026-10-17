"""Shared helpers for tests that use the recorded Solo samples in tests/fixtures/."""

import json

import pytest

from sudoku.tatham import GRIDS, PIPELINE, SOLO_GEN, SOLOSOLVER, parse_game_id

__all__ = ["GRIDS", "SOLOSOLVER", "SOLO_GEN"]

# Solo grid params -> fixture file.
FIXTURE_FILES = {
    "3x3": "solo_samples.json",
    "2x3": "solo_samples_2x3.json",
}
FIXTURES = {
    grid: json.loads((PIPELINE / "tests/fixtures" / filename).read_text())
    for grid, filename in FIXTURE_FILES.items()
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


def givens_of(sample: dict) -> str:
    """The givens string of a recorded sample's game ID, e.g. '3x3:9a8f...'."""
    grid = sample["gameId"].split(":", 1)[0]
    return parse_game_id(sample["gameId"], grid)


def encode_desc(givens: str) -> str:
    """Encode a givens string the way solo.c's encode_grid() does: the parser's inverse.

    Empty runs become 'a'-'z' (longer runs split at 26), and '_' goes only between two
    adjacent givens.
    """
    out: list[str] = []
    run = 0

    def flush() -> None:
        nonlocal run
        while run > 0:
            step = min(run, 26)
            out.append(chr(ord("a") + step - 1))
            run -= step

    for ch in givens:
        if ch == "0":
            run += 1
            continue
        if run:
            flush()
        elif out:
            out.append("_")
        out.append(ch)
    flush()
    return "".join(out)
