"""Verify a puzzle before it can go into a pack.

A puzzle passes only if its givens are well formed, no digit repeats in a row, column or
box, it has exactly one solution, and that solution is a complete valid grid matching
every given (docs/phase_1.md, "Puzzle pipeline", step 3).
"""

from collections import Counter
from enum import StrEnum

from sudoku.shape import SUDOKU_9X9, Shape
from sudoku.solver import count_solutions

_COUNT_WORDS = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight"}


class RejectReason(StrEnum):
    MALFORMED = "malformed"  # not one character per cell, each 0 up to the grid size
    DUPLICATE_GIVEN = "duplicate-given"  # a digit twice in a row, column or box
    NO_SOLUTION = "no-solution"
    MULTIPLE_SOLUTIONS = "multiple-solutions"
    BAD_SOLUTION = "bad-solution"  # the solver's answer failed check_solution: a solver bug


class VerificationError(Exception):
    """A puzzle failed verification. `reason` is what Task 4's report counts."""

    def __init__(self, reason: RejectReason, detail: str) -> None:
        super().__init__(f"{reason}: {detail}")
        self.reason = reason
        self.detail = detail


def find_duplicates(grid: str, shape: Shape = SUDOKU_9X9) -> list[str]:
    """Describe each digit that appears more than once in a row, column or box.

    Empty cells are ignored, and numbers are 1-based, e.g. "row 3 has two 5s". The grid
    must already be well formed (see Shape.check_format).
    """
    problems = []
    for kind, number, cells in shape.units:
        counts = Counter(grid[i] for i in cells if grid[i] != "0")
        for digit, n in sorted(counts.items()):
            if n > 1:
                problems.append(f"{kind} {number} has {_COUNT_WORDS.get(n, n)} {digit}s")
    return problems


def check_solution(givens: str, solution: str, shape: Shape = SUDOKU_9X9) -> list[str]:
    """List what's wrong with solution as the answer to givens; an empty list means it's right."""
    for name, grid in (("givens", givens), ("solution", solution)):
        try:
            shape.check_format(grid)
        except ValueError as error:
            return [f"{name}: {error}"]

    problems = []
    empty = [i for i, ch in enumerate(solution) if ch == "0"]
    if empty:
        first = empty[0]
        problems.append(
            f"{len(empty)} empty cell(s), the first at row {shape.rows[first] + 1}, "
            f"column {shape.cols[first] + 1}"
        )
    problems += find_duplicates(solution, shape)
    for i, (given, answer) in enumerate(zip(givens, solution)):
        if given != "0" and answer != given:
            problems.append(
                f"row {shape.rows[i] + 1}, column {shape.cols[i] + 1} is {answer} "
                f"but the given is {given}"
            )
    return problems


def verify_puzzle(givens: str, shape: Shape = SUDOKU_9X9) -> str:
    """Return the puzzle's unique solution, or raise VerificationError saying why not."""
    try:
        shape.check_format(givens)
    except ValueError as error:
        raise VerificationError(RejectReason.MALFORMED, str(error)) from None

    duplicates = find_duplicates(givens, shape)
    if duplicates:
        raise VerificationError(RejectReason.DUPLICATE_GIVEN, "; ".join(duplicates))

    count, solution = count_solutions(givens, shape, limit=2)
    if count == 0 or solution is None:
        raise VerificationError(RejectReason.NO_SOLUTION, "no grid fits these givens")
    if count > 1:
        raise VerificationError(
            RejectReason.MULTIPLE_SOLUTIONS, "at least two grids fit these givens"
        )

    problems = check_solution(givens, solution, shape)
    if problems:
        raise VerificationError(RejectReason.BAD_SOLUTION, "; ".join(problems))
    return solution
