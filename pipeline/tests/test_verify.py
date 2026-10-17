import pytest
from grids import (
    SPEC_GIVENS,
    SPEC_SOLUTION,
    blank,
    find_deadly_rectangle,
    formula_grid,
    one_blank_per_box,
    set_cells,
)

import sudoku.verify
from sudoku.shape import SUDOKU_6X6, SUDOKU_9X9
from sudoku.verify import (
    RejectReason,
    VerificationError,
    check_solution,
    find_duplicates,
    verify_puzzle,
)

SHAPES = pytest.mark.parametrize("shape", [SUDOKU_9X9, SUDOKU_6X6], ids=["9x9", "6x6"])


def rejection(givens, shape=SUDOKU_9X9):
    with pytest.raises(VerificationError) as caught:
        verify_puzzle(givens, shape)
    return caught.value


def empty_with(shape, values):
    """An empty grid with some cells set: values maps (row, col) 0-based to a digit."""
    return set_cells("0" * shape.cells, {r * shape.size + c: d for (r, c), d in values.items()})


# --- puzzles that pass ---


def test_spec_sample_passes():
    assert verify_puzzle(SPEC_GIVENS) == SPEC_SOLUTION


@SHAPES
def test_unique_puzzle_returns_its_solution(shape):
    grid = formula_grid(shape)
    assert verify_puzzle(blank(grid, one_blank_per_box(shape)), shape) == grid


# --- duplicates ---


@SHAPES
def test_duplicate_in_a_row_only(shape):
    last = shape.size - 1  # far end of the row: a different box
    grid = empty_with(shape, {(0, 0): "1", (0, last): "1"})
    assert find_duplicates(grid, shape) == ["row 1 has two 1s"]
    error = rejection(grid, shape)
    assert error.reason is RejectReason.DUPLICATE_GIVEN
    assert error.detail == "row 1 has two 1s"


@SHAPES
def test_duplicate_in_a_column_only(shape):
    last = shape.size - 1  # bottom of the column: a different box
    grid = empty_with(shape, {(0, 0): "2", (last, 0): "2"})
    assert find_duplicates(grid, shape) == ["column 1 has two 2s"]
    assert rejection(grid, shape).reason is RejectReason.DUPLICATE_GIVEN


@SHAPES
def test_duplicate_in_a_box_only(shape):
    grid = empty_with(shape, {(0, 0): "3", (1, 1): "3"})  # same box, different row and column
    assert find_duplicates(grid, shape) == ["box 1 has two 3s"]
    assert rejection(grid, shape).reason is RejectReason.DUPLICATE_GIVEN


def test_duplicates_are_counted_and_listed_together():
    grid = empty_with(SUDOKU_9X9, {(2, 0): "5", (2, 4): "5", (2, 8): "5", (8, 8): "5"})
    assert find_duplicates(grid) == ["row 3 has three 5s", "column 9 has two 5s"]
    assert rejection(grid).detail == "row 3 has three 5s; column 9 has two 5s"


# --- malformed givens ---


@pytest.mark.parametrize(
    ("shape", "givens", "detail"),
    [
        (SUDOKU_6X6, SPEC_GIVENS, "needs 36 characters, got 81"),
        (SUDOKU_9X9, "0" * 36, "needs 81 characters, got 36"),
        (SUDOKU_9X9, "." + SPEC_GIVENS[1:], "row 1, column 1 is '.'"),
        (SUDOKU_9X9, SPEC_GIVENS[:80] + "x", "row 9, column 9 is 'x'"),
        (SUDOKU_6X6, "7" + "0" * 35, "row 1, column 1 is '7'; expected a digit from 0 to 6"),
    ],
)
def test_malformed_givens(shape, givens, detail):
    error = rejection(givens, shape)
    assert error.reason is RejectReason.MALFORMED
    assert detail in error.detail


# --- wrong number of solutions ---


@SHAPES
def test_no_solution_without_duplicates(shape):
    # Row 1 holds 2..size and the cell below its gap holds 1: nothing repeats, nothing fits.
    values = {(0, c): str(c + 1) for c in range(1, shape.size)} | {(1, 0): "1"}
    grid = empty_with(shape, values)
    assert find_duplicates(grid, shape) == []
    assert rejection(grid, shape).reason is RejectReason.NO_SOLUTION


@SHAPES
def test_empty_grid_has_multiple_solutions(shape):
    assert rejection("0" * shape.cells, shape).reason is RejectReason.MULTIPLE_SOLUTIONS


@SHAPES
def test_deadly_rectangle_has_multiple_solutions(shape):
    candidates = [formula_grid(shape)] + ([SPEC_SOLUTION] if shape is SUDOKU_9X9 else [])
    found = [(grid, cells) for grid in candidates if (cells := find_deadly_rectangle(grid, shape))]
    assert found, "no deadly rectangle in any candidate grid; add another solved grid"
    grid, cells = found[0]
    assert rejection(blank(grid, cells), shape).reason is RejectReason.MULTIPLE_SOLUTIONS


def test_wrong_answer_from_the_solver_is_caught(monkeypatch):
    # verify_puzzle re-checks the solver's answer, so a solver bug can't slip through.
    wrong = "1" + SPEC_SOLUTION[1:]
    monkeypatch.setattr(sudoku.verify, "count_solutions", lambda *args, **kwargs: (1, wrong))
    error = rejection(SPEC_GIVENS)
    assert error.reason is RejectReason.BAD_SOLUTION
    assert "row 1, column 1 is 1 but the given is 5" in error.detail


# --- check_solution ---


@SHAPES
def test_check_solution_accepts_a_correct_answer(shape):
    grid = formula_grid(shape)
    assert check_solution(blank(grid, one_blank_per_box(shape)), grid, shape) == []


def test_check_solution_finds_empty_cells():
    assert SPEC_GIVENS[2] == "0"  # row 1, column 3 isn't a given
    problems = check_solution(SPEC_GIVENS, blank(SPEC_SOLUTION, [2]))
    assert problems == ["1 empty cell(s), the first at row 1, column 3"]


def test_check_solution_finds_duplicates():
    swapped = SPEC_SOLUTION[1] + SPEC_SOLUTION[0] + SPEC_SOLUTION[2:]  # breaks two columns
    problems = check_solution("0" * 81, swapped)
    assert problems == ["column 1 has two 3s", "column 2 has two 5s"]


def test_check_solution_finds_changed_givens():
    givens = "6" + SPEC_GIVENS[1:]  # the real answer has 5 there
    assert check_solution(givens, SPEC_SOLUTION) == ["row 1, column 1 is 5 but the given is 6"]


@pytest.mark.parametrize(
    ("shape", "solution", "problem"),
    [
        (SUDOKU_9X9, SPEC_SOLUTION[:80], "solution: a 9x9 grid needs 81 characters, got 80"),
        (SUDOKU_6X6, SPEC_SOLUTION, "givens: a 6x6 grid needs 36 characters, got 81"),
    ],
)
def test_check_solution_rejects_bad_formats(shape, solution, problem):
    assert check_solution(SPEC_GIVENS, solution, shape) == [problem]


def test_verification_error_text():
    error = VerificationError(RejectReason.NO_SOLUTION, "no grid fits these givens")
    assert str(error) == "no-solution: no grid fits these givens"
