"""Record tests/fixtures/solo_samples.json from the built generator.

Run from pipeline/ after building solo-gen (see README.md):

    uv run python scripts/record_solo_samples.py

Same commit and seeds give the same file, so re-running it is safe.
"""

import json
import subprocess
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent
SOLO_GEN = PIPELINE / "out/build/solo-gen"
SOLOSOLVER = PIPELINE / "out/build/puzzles/solosolver"
FIXTURE = PIPELINE / "tests/fixtures/solo_samples.json"
SAMPLES_PER_GRADE = 5

# (band, grade, params): bands from docs/phase_1.md, params from solo.c's decode_params().
GRADES = [
    (1, "trivial", "3x3dt"),
    (2, "basic", "3x3db"),
    (3, "intermediate", "3x3di"),
    (4, "advanced", "3x3da"),
    (5, "extreme", "3x3de"),
]


def run(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def solosolver_rating(game_id: str) -> str:
    # Prints e.g. "Difficulty rating: Extreme (complex non-recursive techniques required)".
    line = run(str(SOLOSOLVER), "-g", game_id).strip()
    return line.removeprefix("Difficulty rating: ").split(" ", 1)[0]


def main() -> None:
    commit = run("git", "-C", str(PIPELINE / "vendor/puzzles"), "rev-parse", "HEAD").strip()
    grades = []
    for band, grade, params in GRADES:
        seed = f"task2-{grade}"
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
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(fixture, indent=2) + "\n")
    print(f"wrote {FIXTURE.relative_to(PIPELINE)}")


if __name__ == "__main__":
    main()
