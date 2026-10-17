"""Record a Solo sample fixture in tests/fixtures/ from the built generator.

Run from pipeline/ after building solo-gen (see README.md):

    uv run python scripts/record_solo_samples.py              # 9x9: solo_samples.json
    uv run python scripts/record_solo_samples.py --grid 2x3   # 6x6: solo_samples_2x3.json

Same commit and seeds give the same file, so re-running it is safe.
"""

import argparse
import json
import sys
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PIPELINE))  # so `sudoku` imports when run as a script

from sudoku import tatham

FIXTURES = PIPELINE / "tests/fixtures"
SAMPLES_PER_GRADE = 5

# Solo grid params -> (fixture file, seed prefix).
FIXTURE_FILES = {
    "3x3": ("solo_samples.json", "task2"),
    "2x3": ("solo_samples_2x3.json", "task3-2x3"),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--grid", choices=sorted(FIXTURE_FILES), default="3x3")
    grid = parser.parse_args().grid
    filename, seed_prefix = FIXTURE_FILES[grid]

    grades = []
    for band, grade, code in tatham.BANDS:
        params = tatham.params(grid, code)
        seed = f"{seed_prefix}-{grade}"
        pairs = tatham.run_solo_gen(params, SAMPLES_PER_GRADE, seed)
        samples = [{"seedId": seed_id, "gameId": game_id} for seed_id, game_id in pairs]
        ratings = {tatham.solosolver_rating(sample["gameId"]) for sample in samples}
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
        "puzzlesCommit": tatham.puzzles_commit(),
        "samplesPerGrade": SAMPLES_PER_GRADE,
        "grades": grades,
    }
    path = FIXTURES / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fixture, indent=2) + "\n")
    print(f"wrote {path.relative_to(PIPELINE)}")


if __name__ == "__main__":
    main()
