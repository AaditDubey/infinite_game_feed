"""Checks the Task 2 findings recorded in tests/fixtures/solo_samples.json.

scripts/record_solo_samples.py writes the fixture. Tests that run the binaries
skip until solo-gen is built (see README.md).
"""

import json
import re
import subprocess
from pathlib import Path

import pytest

PIPELINE = Path(__file__).resolve().parent.parent
FIXTURE = json.loads((PIPELINE / "tests/fixtures/solo_samples.json").read_text())
SOLO_GEN = PIPELINE / "out/build/solo-gen"
SOLOSOLVER = PIPELINE / "out/build/puzzles/solosolver"

# (band, grade, params) from docs/phase_1.md's band table. Unreasonable is never used.
EXPECTED_GRADES = [
    (1, "trivial", "3x3dt"),
    (2, "basic", "3x3db"),
    (3, "intermediate", "3x3di"),
    (4, "advanced", "3x3da"),
    (5, "extreme", "3x3de"),
]
GAME_ID = re.compile(r"^3x3:[a-z1-9_]+$")

SAMPLES = [(grade["grade"], sample) for grade in FIXTURE["grades"] for sample in grade["samples"]]
needs_build = pytest.mark.skipif(
    not (SOLO_GEN.exists() and SOLOSOLVER.exists()),
    reason="solo-gen isn't built; see pipeline/README.md",
)


def count_cells(desc: str) -> tuple[int, int]:
    """Return (cells, givens) for a 9x9 Solo grid description.

    'a'-'z' are runs of 1-26 empty cells, each digit is one given, and '_' only
    separates two adjacent givens. (Task 4's parser replaces this.)
    """
    cells = givens = 0
    for ch in desc:
        if ch.islower():
            cells += ord(ch) - ord("a") + 1
        elif ch.isdigit():
            cells += 1
            givens += 1
    return cells, givens


def test_grades_match_the_spec_bands():
    found = [(grade["band"], grade["grade"], grade["params"]) for grade in FIXTURE["grades"]]
    assert found == EXPECTED_GRADES


def test_every_grade_has_five_samples():
    assert FIXTURE["samplesPerGrade"] == 5
    for grade in FIXTURE["grades"]:
        assert len(grade["samples"]) == 5, grade["grade"]


def test_game_ids_are_unique():
    game_ids = [sample["gameId"] for _, sample in SAMPLES]
    assert len(set(game_ids)) == len(game_ids)


@pytest.mark.parametrize(("grade", "sample"), SAMPLES)
def test_game_id_is_a_9x9_grid(grade, sample):
    game_id = sample["gameId"]
    assert GAME_ID.match(game_id), game_id
    cells, givens = count_cells(game_id.removeprefix("3x3:"))
    assert cells == 81
    assert 17 <= givens < 81


@pytest.mark.parametrize("grade", FIXTURE["grades"], ids=lambda grade: grade["grade"])
def test_seed_ids_follow_the_gtk_scheme(grade):
    # Solo leaves default settings out of seed IDs: Trivial ("dt") is the default grade.
    expected_params = "3x3" if grade["grade"] == "trivial" else grade["params"]
    assert grade["canonicalParams"] == expected_params
    seed_ids = [sample["seedId"] for sample in grade["samples"]]
    prefix = f"{expected_params}#{grade['seed']}"
    assert seed_ids == [prefix] + [f"{prefix}-{i}" for i in range(1, 5)]


@needs_build
@pytest.mark.parametrize("grade", FIXTURE["grades"], ids=lambda grade: grade["grade"])
def test_same_seed_regenerates_the_fixture(grade):
    output = subprocess.run(
        [str(SOLO_GEN), "5", grade["params"], grade["seed"]],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    expected = "".join(f"{s['seedId']}\t{s['gameId']}\n" for s in grade["samples"])
    assert output == expected


@needs_build
@pytest.mark.parametrize(("grade", "sample"), SAMPLES)
def test_solosolver_agrees_with_the_grade(grade, sample):
    output = subprocess.run(
        [str(SOLOSOLVER), "-g", sample["gameId"]],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    assert output.startswith(f"Difficulty rating: {grade.capitalize()} ")
