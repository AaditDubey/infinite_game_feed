import copy
import json

import pytest
from grids import SPEC_SOLUTION, blank, find_deadly_rectangle
from solo_ids import FIXTURES, SAMPLES, encode_desc, needs_build

from sudoku import tatham
from sudoku.build_pack import (
    REJECT_REASONS,
    BuildError,
    PackName,
    build,
    check_raw,
    existing_givens,
    format_report,
    main,
    pack_name,
    pack_text,
    write_json_atomically,
)
from sudoku.shape import SUDOKU_6X6, SUDOKU_9X9
from sudoku.verify import verify_puzzle

ALL_GRIDS = pytest.mark.parametrize("grid", list(FIXTURES))
RATINGS = {sample["gameId"]: grade["solosolverRating"] for _, grade, sample in SAMPLES}


def fake_rate(game_id: str) -> str:
    """Tatham's grades for the recorded puzzles, without running solosolver."""
    return RATINGS[game_id]


def fixture_raw(grid: str = "3x3") -> tuple[dict, PackName]:
    """Raw output made of the recorded Solo samples: 5 real puzzles per band."""
    fixture = FIXTURES[grid]
    name = PackName(grid, tatham.GRIDS[grid][1], "001")
    bands = [
        {
            "band": grade["band"],
            "grade": grade["grade"],
            "params": grade["params"],
            "seed": grade["seed"],
            "count": len(grade["samples"]),
            "puzzles": copy.deepcopy(grade["samples"]),
        }
        for grade in fixture["grades"]
    ]
    raw = {
        "pack": name.stem,
        "grid": grid,
        "puzzlesCommit": fixture["puzzlesCommit"],
        "generatedOn": "2026-10-17",
        "bands": bands,
    }
    return raw, name


def band_ids(raw: dict, band: int) -> list[str]:
    return [item["gameId"] for item in raw["bands"][band - 1]["puzzles"]]


# --- the pack itself ---


@ALL_GRIDS
def test_pack_fields_follow_the_spec(grid):
    raw, name = fixture_raw(grid)
    shape, label = tatham.GRIDS[grid]
    pack, report = build(raw, name, 3, set(), fake_rate)

    assert list(pack) == [
        "schemaVersion",
        "game",
        "packId",
        "grid",
        "createdAt",
        "generator",
        "puzzles",
    ]
    assert pack["schemaVersion"] == 1
    assert pack["game"] == "sudoku"
    assert pack["packId"] == f"sudoku-{label}-001"
    assert pack["grid"] == {
        "size": shape.size,
        "boxWidth": shape.block_width,
        "boxHeight": shape.block_height,
    }
    assert pack["createdAt"] == "2026-10-17"
    assert pack["generator"] == {"name": "tatham-solo", "version": raw["puzzlesCommit"]}

    puzzles = pack["puzzles"]
    assert [p["id"] for p in puzzles] == [f"sudoku-{label}-001-{i:04d}" for i in range(1, 16)]
    assert [p["band"] for p in puzzles] == [b for b in range(1, 6) for _ in range(3)]
    for puzzle in puzzles:
        assert list(puzzle) == ["id", "band", "grade", "givens", "solution", "clues", "sourceId"]
        assert puzzle["grade"] == tatham.BANDS[puzzle["band"] - 1][1]
        assert puzzle["givens"] == tatham.parse_game_id(puzzle["sourceId"], grid)
        assert puzzle["solution"] == verify_puzzle(puzzle["givens"], shape)
        assert puzzle["clues"] == sum(ch != "0" for ch in puzzle["givens"])

    # The first 3 accepted puzzles of each band ship, in raw order.
    for band in range(1, 6):
        shipped = [p["sourceId"] for p in puzzles if p["band"] == band]
        assert shipped == band_ids(raw, band)[:3]
    assert [(b.generated, b.accepted, b.shipped, b.duplicates) for b in report.bands] == [
        (5, 5, 3, 0)
    ] * 5
    assert report.problems(3) == []


def test_build_is_deterministic():
    raw, name = fixture_raw()
    first, _ = build(raw, name, 4, set(), fake_rate)
    second, _ = build(copy.deepcopy(raw), name, 4, set(), fake_rate)
    assert pack_text(first) == pack_text(second)


def test_bands_must_be_in_order():
    raw, name = fixture_raw()
    raw["bands"].reverse()
    with pytest.raises(BuildError, match="bands aren't 1 to 5"):
        build(raw, name, 3, set(), fake_rate)


# --- duplicates and shortfalls ---


def test_duplicates_in_the_raw_output_are_skipped():
    raw, name = fixture_raw()
    first = raw["bands"][0]["puzzles"][0]
    raw["bands"][0]["puzzles"].insert(1, dict(first))
    pack, report = build(raw, name, 3, set(), fake_rate)
    assert report.bands[0].duplicates == 1
    shipped = [p["sourceId"] for p in pack["puzzles"] if p["band"] == 1]
    assert shipped == [band_ids(fixture_raw()[0], 1)[i] for i in range(3)]


def test_duplicates_of_other_packs_are_skipped():
    raw, name = fixture_raw()
    taken = tatham.parse_game_id(band_ids(raw, 1)[0], "3x3")
    pack, report = build(raw, name, 3, {taken}, fake_rate)
    assert report.bands[0].duplicates == 1
    assert [p["sourceId"] for p in pack["puzzles"] if p["band"] == 1] == band_ids(raw, 1)[1:4]


def test_too_few_unique_puzzles_is_a_problem():
    raw, name = fixture_raw()
    taken = tatham.parse_game_id(band_ids(raw, 1)[0], "3x3")
    _, report = build(raw, name, 5, {taken}, fake_rate)
    assert report.problems(5) == [
        "band 1 (trivial): only 4 of 5 unique puzzles; rerun with a larger --extra and --regenerate"
    ]


# --- rejects stop the build ---


def test_a_puzzle_with_two_solutions_fails_the_build():
    raw, name = fixture_raw()
    cells = find_deadly_rectangle(SPEC_SOLUTION, SUDOKU_9X9)
    game_id = "3x3:" + encode_desc(blank(SPEC_SOLUTION, cells))
    raw["bands"][0]["puzzles"].append({"seedId": "crafted", "gameId": game_id})
    _, report = build(raw, name, 3, set(), fake_rate)
    assert report.bands[0].rejects == {"multiple-solutions": 1}
    assert "band 1 (trivial): 1 rejected as multiple-solutions" in report.problems(3)


def test_an_unparseable_id_fails_the_build():
    raw, name = fixture_raw()
    raw["bands"][2]["puzzles"].append({"seedId": "crafted", "gameId": "3x3:zz"})
    _, report = build(raw, name, 3, set(), fake_rate)
    assert report.bands[2].rejects == {"unparseable": 1}
    assert report.problems(3) == ["band 3 (intermediate): 1 rejected as unparseable"]


def test_a_grade_mismatch_fails_the_build():
    raw, name = fixture_raw()
    wrong = band_ids(raw, 1)[0]
    _, report = build(raw, name, 3, set(), lambda g: "Basic" if g == wrong else fake_rate(g))
    assert report.bands[0].rejects == {"grade-mismatch": 1}
    assert report.problems(3) == ["band 1 (trivial): 1 rejected as grade-mismatch"]


def test_report_lists_every_reason():
    raw, name = fixture_raw()
    _, report = build(raw, name, 3, set(), fake_rate)
    text = format_report(name, report)
    assert "total" in text
    for reason in REJECT_REASONS:
        assert f"{reason} 0" in text


# --- names, raw output and files ---


@pytest.mark.parametrize(
    ("filename", "grid", "expected"),
    [
        ("pack-9x9-001.json", "3x3", ("sudoku-9x9-001", "pack-9x9-001-band4")),
        ("pack-6x6-012.json", "2x3", ("sudoku-6x6-012", "pack-6x6-012-band4")),
    ],
)
def test_pack_names(tmp_path, filename, grid, expected):
    name = pack_name(tmp_path / filename, grid)
    assert (name.pack_id, name.seed(4)) == expected


@pytest.mark.parametrize(
    ("filename", "grid", "message"),
    [
        ("pack-001.json", "3x3", "must be named"),
        ("pack-9x9-1.json", "3x3", "must be named"),
        ("pack-6x6-001.json", "3x3", "is a 6x6 pack, but --grid 3x3 is 9x9"),
    ],
)
def test_bad_pack_names(tmp_path, filename, grid, message):
    with pytest.raises(BuildError, match=message):
        pack_name(tmp_path / filename, grid)


def matching_raw() -> tuple[dict, PackName]:
    raw, name = fixture_raw()
    for band_raw, (band, _, code) in zip(raw["bands"], tatham.BANDS):
        band_raw["seed"] = name.seed(band)
        band_raw["params"] = tatham.params("3x3", code)
    return raw, name


def test_matching_raw_output_is_accepted():
    raw, name = matching_raw()
    check_raw(raw, name, 5, raw["puzzlesCommit"])


@pytest.mark.parametrize(
    ("change", "count", "message"),
    [
        (lambda raw: raw.update(puzzlesCommit="0" * 40), 5, "made with Solo 0000000"),
        (lambda raw: raw["bands"][1].update(seed="other"), 5, "seeds don't match"),
        (lambda raw: raw.update(grid="2x3"), 5, "for grid '2x3'"),
        (lambda raw: None, 6, "fewer than 6 puzzles"),
    ],
)
def test_stale_raw_output_is_refused(change, count, message):
    raw, name = matching_raw()
    commit = raw["puzzlesCommit"]
    change(raw)
    with pytest.raises(BuildError, match=message) as caught:
        check_raw(raw, name, count, commit)
    assert "--regenerate" in str(caught.value)


def test_existing_givens_reads_other_packs_of_the_same_shape(tmp_path):
    def write(filename, shape, givens):
        grid = {"size": shape.size, "boxWidth": shape.block_width, "boxHeight": shape.block_height}
        pack = {"grid": grid, "puzzles": [{"givens": g} for g in givens]}
        (tmp_path / filename).write_text(json.dumps(pack))

    write("pack-9x9-001.json", SUDOKU_9X9, ["self"])  # the pack being rebuilt
    write("pack-9x9-002.json", SUDOKU_9X9, ["other-9x9"])
    write("pack-6x6-001.json", SUDOKU_6X6, ["other-6x6"])
    assert existing_givens(tmp_path / "pack-9x9-001.json", SUDOKU_9X9) == {"other-9x9"}


def test_atomic_write_leaves_no_temp_files(tmp_path):
    path = tmp_path / "packs" / "pack-9x9-001.json"
    write_json_atomically(path, "{}\n")
    assert path.read_text() == "{}\n"
    assert [p.name for p in path.parent.iterdir()] == ["pack-9x9-001.json"]


# --- the command, end to end ---


@needs_build
def test_cli_builds_and_rebuilds_identically(tmp_path, capsys):
    out = tmp_path / "pack-6x6-001.json"
    raw_dir = tmp_path / "raw"
    args = ["--grid", "2x3", "--per-band", "3", "--extra", "0"]
    args += ["--out", str(out), "--raw-dir", str(raw_dir)]

    assert main(args, today="2026-10-17") == 0
    first = out.read_text()
    pack = json.loads(first)
    assert pack["packId"] == "sudoku-6x6-001"
    assert len(pack["puzzles"]) == 15

    assert main(args, today="2099-01-01") == 0  # reuses the raw output, so its date stays
    assert out.read_text() == first

    (raw_dir / "pack-6x6-001.json").unlink()
    assert main(args, today="2026-10-17") == 0  # regenerating from the same seeds
    assert out.read_text() == first

    raw_path = raw_dir / "pack-6x6-001.json"
    raw = json.loads(raw_path.read_text())
    raw["puzzlesCommit"] = "0" * 40
    raw_path.write_text(json.dumps(raw))
    capsys.readouterr()
    assert main(args) == 1
    assert "--regenerate" in capsys.readouterr().err
    assert out.read_text() == first  # a failed build writes nothing


def test_cli_rejects_a_mismatched_name(tmp_path):
    args = ["--grid", "3x3", "--per-band", "1", "--out", str(tmp_path / "pack-6x6-001.json")]
    with pytest.raises(SystemExit) as caught:
        main(args)
    assert caught.value.code == 2
