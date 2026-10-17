import pytest
from solo_ids import FIXTURES, SAMPLE_IDS, SAMPLES, encode_desc, needs_build

from sudoku import tatham
from sudoku.tatham import GRIDS, parse_game_id

# The README's worked example: the first recorded 9x9 Trivial puzzle.
README_ID = "3x3:9a8f1a2a9a5_6_4a7_5_3b1d6a5c2c7a1c7c6a8d1b9_6_8a5_6_7a3a2a9f3a1"
README_GIVENS = "908000000102090564075300100006050002000701000700060800001009680567030209000000301"


def test_readme_example():
    assert parse_game_id(README_ID, "3x3") == README_GIVENS


@pytest.mark.parametrize(("grid", "grade", "sample"), SAMPLES, ids=SAMPLE_IDS)
def test_recorded_ids_round_trip(grid, grade, sample):
    # Parsing then re-encoding the way solo.c does gives back Solo's exact text.
    givens = parse_game_id(sample["gameId"], grid)
    assert len(givens) == GRIDS[grid][0].cells
    assert f"{grid}:{encode_desc(givens)}" == sample["gameId"]


def test_runs_longer_than_26_are_split():
    givens = "1" + "0" * 79 + "2"
    assert encode_desc(givens) == "1zzza2"  # 79 = 26 + 26 + 26 + 1
    assert parse_game_id("3x3:1zzza2", "3x3") == givens


@pytest.mark.parametrize(
    ("game_id", "grid", "message"),
    [
        ("3x3" + README_ID[3:], "2x3", "expected a 2x3 game ID, got '3x3'"),
        ("2x3:" + "f" * 6, "3x3", "expected a 3x3 game ID, got '2x3'"),
        ("9a8f", "3x3", "has no ':'"),
        ("3x3:12" + "z" * 3 + "a", "3x3", "given 12 is above 9"),
        ("2x3:7zi", "2x3", "given 7 is above 6"),
        ("3x3:" + "z" * 3 + "c,abc", "3x3", "jigsaw and killer"),
        ("3x3:" + "z" * 3 + "b.", "3x3", "unexpected '.'"),
        ("3x3:" + "z" * 3 + "b", "3x3", "game ID has 80 cells; a 3x3 grid has 81"),
        ("3x3:" + "z" * 3 + "d", "3x3", "game ID has 82 cells"),
        ("3x3:0" + "z" * 3 + "b", "3x3", "unexpected '0'"),
        ("4x4:abc", "4x4", "unknown grid '4x4'"),
    ],
)
def test_bad_game_ids(game_id, grid, message):
    with pytest.raises(ValueError, match=message):
        parse_game_id(game_id, grid)


def test_params():
    assert [tatham.params("3x3", code) for _, _, code in tatham.BANDS] == [
        "3x3dt",
        "3x3db",
        "3x3di",
        "3x3da",
        "3x3de",
    ]
    assert tatham.params("2x3", "da") == "2x3da"
    with pytest.raises(ValueError, match="unknown grid"):
        tatham.params("4x4", "dt")


def test_missing_binary_has_a_clear_error(monkeypatch, tmp_path):
    monkeypatch.setattr(tatham, "SOLO_GEN", tatham.PIPELINE / "out/nowhere/solo-gen")
    with pytest.raises(FileNotFoundError, match="out/nowhere/solo-gen isn't built"):
        tatham.run_solo_gen("3x3dt", 1, "x")


@needs_build
@pytest.mark.parametrize("grid", list(FIXTURES))
def test_run_solo_gen_reproduces_the_fixture(grid):
    grade = FIXTURES[grid]["grades"][0]
    pairs = tatham.run_solo_gen(grade["params"], 5, grade["seed"])
    assert pairs == [(s["seedId"], s["gameId"]) for s in grade["samples"]]


@needs_build
def test_solosolver_rating():
    for grid, fixture in FIXTURES.items():
        for grade in fixture["grades"]:
            game_id = grade["samples"][0]["gameId"]
            assert tatham.solosolver_rating(game_id) == grade["solosolverRating"], grid


def test_puzzles_commit_matches_the_fixtures():
    assert tatham.puzzles_commit() == FIXTURES["3x3"]["puzzlesCommit"]
