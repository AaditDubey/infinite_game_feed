"""Build a Sudoku pack: generate with Solo, verify with our own solver, write the JSON.

Run from pipeline/ after building solo-gen (see README.md):

    uv run python -m sudoku.build_pack --grid 3x3 --per-band 100 \\
        --out ../assets/puzzles/sudoku/pack-9x9-001.json

The steps follow docs/phase_1.md ("Puzzle pipeline"):
1. Generate each band with Solo, caching the raw output in out/raw/.
2. Parse each game ID.
3. Verify it.
4. Skip duplicates, including against the other packs next to --out.
5. Write the pack sorted by band then id.
6. Report.

Solo guarantees valid, unique puzzles at the exact grade, so any reject other than a
duplicate means a bug. In that case the build stops and writes nothing.
"""

import argparse
import datetime
import json
import os
import re
import sys
import tempfile
from collections import Counter
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from sudoku import tatham
from sudoku.shape import Shape
from sudoku.verify import RejectReason, VerificationError, verify_puzzle

SCHEMA_VERSION = 1
PACK_FILE = re.compile(r"pack-(?P<label>9x9|6x6)-(?P<number>\d{3})\.json")
UNPARSEABLE = "unparseable"
GRADE_MISMATCH = "grade-mismatch"
REJECT_REASONS = [UNPARSEABLE, *(reason.value for reason in RejectReason), GRADE_MISMATCH]


class BuildError(Exception):
    """The pack can't be built; the message says why and what to do."""


@dataclass(frozen=True)
class PackName:
    """Names derived from the output file, e.g. pack-9x9-001.json with grid 3x3."""

    grid: str  # Solo params prefix: "3x3" or "2x3"
    label: str  # "9x9" or "6x6"
    number: str  # "001"

    @property
    def stem(self) -> str:
        """pack-9x9-001: the file stem, the raw file's name and the seed prefix."""
        return f"pack-{self.label}-{self.number}"

    @property
    def pack_id(self) -> str:
        return f"sudoku-{self.label}-{self.number}"

    def seed(self, band: int) -> str:
        return f"{self.stem}-band{band}"


def pack_name(out: Path, grid: str) -> PackName:
    match = PACK_FILE.fullmatch(out.name)
    if not match:
        raise BuildError(f"--out must be named pack-<9x9|6x6>-<NNN>.json, got {out.name!r}")
    label = tatham.GRIDS[grid][1]
    if match["label"] != label:
        raise BuildError(f"{out.name} is a {match['label']} pack, but --grid {grid} is {label}")
    return PackName(grid, label, match["number"])


def grid_field(shape: Shape) -> dict[str, int]:
    return {"size": shape.size, "boxWidth": shape.block_width, "boxHeight": shape.block_height}


# --- raw output (step 1) ---


def generate_raw(name: PackName, count: int, generated_on: str) -> dict:
    """Run solo-gen for every band in parallel; returns the raw record to cache."""

    def one_band(entry: tuple[int, str, str]) -> dict:
        band, grade, code = entry
        solo_params = tatham.params(name.grid, code)
        seed = name.seed(band)
        pairs = tatham.run_solo_gen(solo_params, count, seed)
        print(f"  band {band} ({grade}): generated {count}", file=sys.stderr)
        return {
            "band": band,
            "grade": grade,
            "params": solo_params,
            "seed": seed,
            "count": count,
            "puzzles": [{"seedId": seed_id, "gameId": game_id} for seed_id, game_id in pairs],
        }

    # The work happens in solo-gen subprocesses, so threads run them in parallel.
    with ThreadPoolExecutor(max_workers=len(tatham.BANDS)) as pool:
        bands = list(pool.map(one_band, tatham.BANDS))
    return {
        "pack": name.stem,
        "grid": name.grid,
        "puzzlesCommit": tatham.puzzles_commit(),
        "generatedOn": generated_on,
        "bands": bands,
    }


def check_raw(raw: dict, name: PackName, count: int, commit: str) -> None:
    """Raise BuildError unless raw was generated for this pack, commit and count."""
    problems = []
    if raw.get("grid") != name.grid:
        problems.append(f"it's for grid {raw.get('grid')!r}, not {name.grid!r}")
    if raw.get("puzzlesCommit") != commit:
        problems.append(
            f"it was made with Solo {str(raw.get('puzzlesCommit'))[:7]}, not {commit[:7]}"
        )
    expected = [
        (band, tatham.params(name.grid, code), name.seed(band)) for band, _, code in tatham.BANDS
    ]
    found = [(b.get("band"), b.get("params"), b.get("seed")) for b in raw.get("bands", [])]
    if found != expected:
        problems.append("its bands, params or seeds don't match this pack")
    elif any(b.get("count", 0) < count or len(b.get("puzzles", [])) < count for b in raw["bands"]):
        problems.append(f"it has fewer than {count} puzzles in a band")
    if problems:
        raise BuildError(
            "the raw output doesn't match this build: "
            + "; ".join(problems)
            + ". Rerun with --regenerate."
        )


# --- parse, verify, deduplicate, assemble (steps 2-5) ---


@dataclass
class BandReport:
    band: int
    grade: str
    generated: int = 0
    duplicates: int = 0
    accepted: int = 0
    shipped: int = 0
    rejects: Counter = field(default_factory=Counter)


@dataclass
class Report:
    bands: list[BandReport]

    def rejects(self) -> Counter:
        total: Counter = Counter()
        for band in self.bands:
            total.update(band.rejects)
        return total

    def problems(self, per_band: int) -> list[str]:
        """Reasons the pack must not be written; empty when it's fine."""
        problems = []
        for band in self.bands:
            for reason, n in sorted(band.rejects.items()):
                problems.append(f"band {band.band} ({band.grade}): {n} rejected as {reason}")
            if band.shipped < per_band:
                problems.append(
                    f"band {band.band} ({band.grade}): only {band.shipped} of {per_band} "
                    "unique puzzles; rerun with a larger --extra and --regenerate"
                )
        return problems


def build(
    raw: dict,
    name: PackName,
    per_band: int,
    existing_givens: set[str],
    rate: Callable[[str], str] = tatham.solosolver_rating,
) -> tuple[dict, Report]:
    """Turn raw generator output into a pack. Does no file I/O; `rate` grades a game ID."""
    shape = tatham.GRIDS[name.grid][0]
    if [b["band"] for b in raw["bands"]] != [band for band, _, _ in tatham.BANDS]:
        raise BuildError("the raw output's bands aren't 1 to 5 in order")

    seen = set(existing_givens)
    puzzles = []
    reports = []
    for band_raw in raw["bands"]:
        report = BandReport(band_raw["band"], band_raw["grade"])
        accepted = []
        for item in band_raw["puzzles"]:
            report.generated += 1
            game_id = item["gameId"]
            try:
                givens = tatham.parse_game_id(game_id, name.grid)
            except ValueError:
                report.rejects[UNPARSEABLE] += 1
                continue
            try:
                solution = verify_puzzle(givens, shape)
            except VerificationError as error:
                report.rejects[error.reason.value] += 1
                continue
            if rate(game_id) != band_raw["grade"].capitalize():
                report.rejects[GRADE_MISMATCH] += 1
                continue
            if givens in seen:
                report.duplicates += 1
                continue
            seen.add(givens)
            accepted.append((givens, solution, game_id))

        report.accepted = len(accepted)
        shipped = accepted[:per_band]
        report.shipped = len(shipped)
        reports.append(report)
        for givens, solution, game_id in shipped:
            puzzles.append(
                {
                    "id": f"{name.pack_id}-{len(puzzles) + 1:04d}",
                    "band": band_raw["band"],
                    "grade": band_raw["grade"],
                    "givens": givens,
                    "solution": solution,
                    "clues": sum(ch != "0" for ch in givens),
                    "sourceId": game_id,
                }
            )

    pack = {
        "schemaVersion": SCHEMA_VERSION,
        "game": "sudoku",
        "packId": name.pack_id,
        "grid": grid_field(shape),
        # From the raw output, not today's date, so rebuilding gives an identical file.
        "createdAt": raw["generatedOn"],
        "generator": {"name": "tatham-solo", "version": raw["puzzlesCommit"]},
        "puzzles": puzzles,
    }
    return pack, Report(reports)


def existing_givens(out: Path, shape: Shape) -> set[str]:
    """Givens from the other packs of this shape in out's folder (not out itself)."""
    found: set[str] = set()
    for path in sorted(out.parent.glob("pack-*.json")):
        if path.resolve() == out.resolve():
            continue
        pack = json.loads(path.read_text())
        if pack.get("grid") == grid_field(shape):
            found.update(puzzle["givens"] for puzzle in pack["puzzles"])
    return found


# --- writing and reporting (steps 5-6) ---


def pack_text(pack: dict) -> str:
    return json.dumps(pack, indent=2) + "\n"


def write_json_atomically(path: Path, text: str) -> None:
    """Write via a temp file and rename, so a half-written file never exists."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


_COLUMNS = ["generated", "rejected", "duplicates", "accepted", "shipped"]


def _row(label: str, values: list) -> str:
    return f"{label:<20}" + "".join(f"{value:>12}" for value in values)


def format_report(name: PackName, report: Report) -> str:
    rows = [_row("band", _COLUMNS)]
    totals = [0] * len(_COLUMNS)
    for b in report.bands:
        values = [b.generated, sum(b.rejects.values()), b.duplicates, b.accepted, b.shipped]
        totals = [t + v for t, v in zip(totals, values)]
        rows.append(_row(f"{b.band} {b.grade}", values))
    rows.append(_row("total", totals))
    rejects = report.rejects()
    rows.append("rejects: " + ", ".join(f"{reason} {rejects[reason]}" for reason in REJECT_REASONS))
    return f"{name.stem} ({name.label})\n" + "\n".join(rows)


def _display(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(Path.cwd().resolve()))
    except ValueError:
        return str(path)


def main(argv: list[str] | None = None, today: str | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m sudoku.build_pack", description=__doc__.splitlines()[0]
    )
    parser.add_argument("--grid", required=True, choices=sorted(tatham.GRIDS))
    parser.add_argument("--per-band", type=int, required=True, help="puzzles to ship per band")
    parser.add_argument("--out", type=Path, required=True, help="pack-<9x9|6x6>-<NNN>.json")
    parser.add_argument("--extra", type=int, default=10, help="spare puzzles generated per band")
    parser.add_argument("--regenerate", action="store_true", help="ignore cached raw output")
    parser.add_argument("--raw-dir", type=Path, default=tatham.PIPELINE / "out/raw")
    args = parser.parse_args(argv)
    if args.per_band < 1 or args.extra < 0:
        parser.error("--per-band must be at least 1 and --extra at least 0")
    try:
        name = pack_name(args.out, args.grid)
    except BuildError as error:
        parser.error(str(error))

    try:
        shape = tatham.GRIDS[name.grid][0]
        count = args.per_band + args.extra
        raw_path = args.raw_dir / f"{name.stem}.json"
        if args.regenerate or not raw_path.exists():
            print(f"generating {count} puzzles per band for {name.stem}...", file=sys.stderr)
            generated_on = today or datetime.date.today().isoformat()
            raw = generate_raw(name, count, generated_on)
            write_json_atomically(raw_path, json.dumps(raw, indent=2) + "\n")
        else:
            raw = json.loads(raw_path.read_text())
            check_raw(raw, name, count, tatham.puzzles_commit())

        pack, report = build(raw, name, args.per_band, existing_givens(args.out, shape))
        print(format_report(name, report))
        print(
            f"raw: {_display(raw_path)} (generated {raw['generatedOn']}, "
            f"Solo {raw['puzzlesCommit'][:7]})"
        )
        problems = report.problems(args.per_band)
        if problems:
            for problem in problems:
                print(f"error: {problem}", file=sys.stderr)
            print(f"error: nothing written to {_display(args.out)}", file=sys.stderr)
            return 1

        text = pack_text(pack)
        write_json_atomically(args.out, text)
        print(
            f"wrote {_display(args.out)}: {len(pack['puzzles'])} puzzles, "
            f"{len(text.encode()) / 1024:.1f} KB"
        )
        return 0
    except BuildError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
