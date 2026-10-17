"""Record a Solo sample fixture in tests/fixtures/ from the built generator.

Run from pipeline/ after building solo-gen (see README.md):

    uv run python scripts/record_solo_samples.py              # 9x9: solo_samples.json
    uv run python scripts/record_solo_samples.py --grid 2x3   # 6x6: solo_samples_2x3.json

Same commit and seeds give the same file, so re-running it is safe.
"""

import argparse
import json
import subprocess
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent
SOLO_GEN = PIPELINE / "out/build/solo-gen"
SOLOSOLVER = PIPELINE / "out/build/puzzles/solosolver"
FIXTURES = PIPELINE / "tests/fixtures"
SAMPLES_PER_GRADE = 5

# Solo grid params -> (fixture file, seed prefix). 3x3 is 9x9; 2x3 is 6x6 with 3x2 blocks.
GRIDS = {
    "3x3": ("solo_samples.json", "task2"),
    "2x3": ("solo_samples_2x3.json", "task3-2x3"),
}

# (band, grade, code): bands from docs/phase_1.md, codes from solo.c's decode_params().
GRADES = [
    (1, "trivial", "dt"),
    (2, "basic", "db"),
    (3, "intermediate", "di"),
    (4, "advanced", "da"),
    (5, "extreme", "de"),
]


def run(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def solosolver_rating(game_id: str) -> str:
    # Prints e.g. "Difficulty rating: Extreme (complex non-recursive techniques required)".
    line = run(str(SOLOSOLVER), "-g", game_id).strip()
    return line.removeprefix("Difficulty rating: ").split(" ", 1)[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--grid", choices=sorted(GRIDS), default="3x3")
    grid = parser.parse_args().grid
    filename, seed_prefix = GRIDS[grid]

    commit = run("git", "-C", str(PIPELINE / "vendor/puzzles"), "rev-parse", "HEAD").strip()
    grades = []
    for band, grade, code in GRADES:
        params = f"{grid}{code}"
        seed = f"{seed_prefix}-{grade}"
        lines = run(str(SOLO_GEN), str(SAMPLES_PER_GRADE), params, seed).splitlines()
        samples = [dict(zip(("seedId", "gameId"), line.split("\t"))) for line in lines]
        ratings = {solosolver_rating(sample["gameId"]) for sample in samples}
        if ratings != {grade.capitalize()}:
            raise SystemExit(f"{grade}: solosolver rated the samples {sorted(ratings)}")
        grades.append(
            {
                "band": band,
                "grade": grade,
                "params": params,
                # How Solo itself writes the params in seed IDs (defaults are left out).
                "canonicalParams": samples[0]["seedId"].split("#")[0],
                "seed": seed,
                "solosolverRating": grade.capitalize(),
                "samples": samples,
            }
        )

    fixture = {
        "puzzlesCommit": commit,
        "samplesPerGrade": SAMPLES_PER_GRADE,
        "grades": grades,
    }
    path = FIXTURES / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fixture, indent=2) + "\n")
    print(f"wrote {path.relative_to(PIPELINE)}")


if __name__ == "__main__":
    main()
