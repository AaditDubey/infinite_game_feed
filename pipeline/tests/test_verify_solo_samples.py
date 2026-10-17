"""Our solver and verifier on every recorded Solo puzzle, 9x9 and 6x6.

Each puzzle must have exactly one solution. Where the binaries are built, our solution
must also match the one Tatham's solosolver prints: two independent solvers agreeing.
"""

import re
import subprocess

import pytest
from solo_ids import GRIDS, SAMPLE_IDS, SAMPLES, SOLOSOLVER, givens_of, needs_build

from sudoku.solver import count_solutions
from sudoku.verify import check_solution, verify_puzzle


@pytest.mark.parametrize(("grid", "grade", "sample"), SAMPLES, ids=SAMPLE_IDS)
def test_puzzle_has_exactly_one_solution(grid, grade, sample):
    shape = GRIDS[grid][1]
    givens = givens_of(sample)
    count, solution = count_solutions(givens, shape, limit=2)
    assert count == 1
    assert verify_puzzle(givens, shape) == solution
    assert check_solution(givens, solution, shape) == []


@needs_build
@pytest.mark.parametrize(("grid", "grade", "sample"), SAMPLES, ids=SAMPLE_IDS)
def test_solution_matches_tatham(grid, grade, sample):
    shape = GRIDS[grid][1]
    output = subprocess.run(
        [str(SOLOSOLVER), sample["gameId"]], check=True, capture_output=True, text=True
    ).stdout
    # solosolver prints the solved grid as text, e.g. "1 2 3 | 8 7 5 | 9 6 4".
    tatham = "".join(re.findall(r"[1-9]", output))
    assert len(tatham) == shape.cells
    assert verify_puzzle(givens_of(sample), shape) == tatham
