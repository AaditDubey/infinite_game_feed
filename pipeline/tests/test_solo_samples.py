"""Checks the Solo findings recorded in tests/fixtures/ (9x9 from Task 2, 6x6 from Task 3).

scripts/record_solo_samples.py writes the fixtures. Tests that run the binaries skip
until solo-gen is built (see README.md).
"""

import re
import subprocess

import pytest
from solo_ids import (
    FIXTURES,
    GRIDS,
    SAMPLE_IDS,
    SAMPLES,
    SOLO_GEN,
    SOLOSOLVER,
    givens_of,
    needs_build,
)

# (band, grade, code) from docs/phase_1.md's band table. Unreasonable is never used.
EXPECTED_GRADES = [
    (1, "trivial", "dt"),
    (2, "basic", "db"),
    (3, "intermediate", "di"),
    (4, "advanced", "da"),
    (5, "extreme", "de"),
]

ALL_GRIDS = pytest.mark.parametrize("grid", list(FIXTURES))
GRADES = [(grid, grade) for grid, fixture in FIXTURES.items() for grade in fixture["grades"]]
GRADE_IDS = [f"{grid}-{grade['grade']}" for grid, grade in GRADES]


@ALL_GRIDS
def test_grades_match_the_spec_bands(grid):
    found = [(g["band"], g["grade"], g["params"]) for g in FIXTURES[grid]["grades"]]
    assert found == [(band, grade, f"{grid}{code}") for band, grade, code in EXPECTED_GRADES]


@ALL_GRIDS
def test_every_grade_has_five_samples(grid):
    assert FIXTURES[grid]["samplesPerGrade"] == 5
    for grade in FIXTURES[grid]["grades"]:
        assert len(grade["samples"]) == 5, grade["grade"]


@ALL_GRIDS
def test_game_ids_are_unique(grid):
    game_ids = [sample["gameId"] for g, _, sample in SAMPLES if g == grid]
    assert len(set(game_ids)) == len(game_ids)


@pytest.mark.parametrize(("grid", "grade", "sample"), SAMPLES, ids=SAMPLE_IDS)
def test_game_id_has_one_character_per_cell(grid, grade, sample):
    shape = GRIDS[grid][0]
    assert re.fullmatch(rf"{grid}:[a-z1-9_]+", sample["gameId"]), sample["gameId"]
    givens = givens_of(sample)
    assert len(givens) == shape.cells
    clues = sum(ch != "0" for ch in givens)
    assert 0 < clues < shape.cells
    if shape.size == 9:
        assert clues >= 17  # no 9x9 Sudoku with fewer clues has a unique solution


@pytest.mark.parametrize(("grid", "grade"), GRADES, ids=GRADE_IDS)
def test_seed_ids_follow_the_gtk_scheme(grid, grade):
    # Solo leaves default settings out of seed IDs: Trivial ("dt") is the default grade.
    expected_params = grid if grade["grade"] == "trivial" else grade["params"]
    assert grade["canonicalParams"] == expected_params
    seed_ids = [sample["seedId"] for sample in grade["samples"]]
    prefix = f"{expected_params}#{grade['seed']}"
    assert seed_ids == [prefix] + [f"{prefix}-{i}" for i in range(1, 5)]


@needs_build
@pytest.mark.parametrize(("grid", "grade"), GRADES, ids=GRADE_IDS)
def test_same_seed_regenerates_the_fixture(grid, grade):
    output = subprocess.run(
        [str(SOLO_GEN), "5", grade["params"], grade["seed"]],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    expected = "".join(f"{s['seedId']}\t{s['gameId']}\n" for s in grade["samples"])
    assert output == expected


@needs_build
@pytest.mark.parametrize(("grid", "grade", "sample"), SAMPLES, ids=SAMPLE_IDS)
def test_solosolver_agrees_with_the_grade(grid, grade, sample):
    output = subprocess.run(
        [str(SOLOSOLVER), "-g", sample["gameId"]],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    assert output.startswith(f"Difficulty rating: {grade['solosolverRating']} ")
