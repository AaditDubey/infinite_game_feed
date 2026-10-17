import pytest
from grids import (
    SPEC_GIVENS,
    SPEC_SOLUTION,
    blank,
    find_deadly_rectangle,
    formula_grid,
    is_solved_by_sets,
    one_blank_per_box,
    set_cells,
)

from sudoku.shape import SUDOKU_6X6, SUDOKU_9X9
from sudoku.solver import count_solutions

SHAPES = pytest.mark.parametrize("shape", [SUDOKU_9X9, SUDOKU_6X6], ids=["9x9", "6x6"])


@SHAPES
def test_formula_grid_is_solved(shape):
    assert is_solved_by_sets(formula_grid(shape), shape)


def test_spec_sample_has_the_spec_solution():
    assert count_solutions(SPEC_GIVENS) == (1, SPEC_SOLUTION)


@SHAPES
def test_full_grid_is_its_own_solution(shape):
    grid = formula_grid(shape)
    assert count_solutions(grid, shape) == (1, grid)


@SHAPES
def test_one_blank_per_box_is_unique(shape):
    grid = formula_grid(shape)
    cells = one_blank_per_box(shape)
    assert len(cells) == shape.size
    assert len({shape.rows[i] for i in cells}) == len({shape.cols[i] for i in cells}) == shape.size
    assert count_solutions(blank(grid, cells), shape) == (1, grid)


@SHAPES
def test_empty_grid_stops_at_the_limit(shape):
    count, solution = count_solutions("0" * shape.cells, shape)
    assert count == 2
    assert is_solved_by_sets(solution, shape)
    assert count_solutions("0" * shape.cells, shape, limit=1)[0] == 1


@SHAPES
def test_cleared_band_has_more_than_one_solution(shape):
    # Swapping two rows inside a band keeps every column and box valid.
    band = range(shape.block_height * shape.size)
    assert count_solutions(blank(formula_grid(shape), band), shape)[0] == 2


@SHAPES
def test_deadly_rectangle_has_exactly_two_solutions(shape):
    candidates = [formula_grid(shape)] + ([SPEC_SOLUTION] if shape is SUDOKU_9X9 else [])
    found = [(grid, cells) for grid in candidates if (cells := find_deadly_rectangle(grid, shape))]
    assert found, "no deadly rectangle in any candidate grid; add another solved grid"
    grid, cells = found[0]
    count, _ = count_solutions(blank(grid, cells), shape, limit=3)
    assert count == 2


@SHAPES
def test_conflicting_givens_have_no_solution(shape):
    assert count_solutions("11" + "0" * (shape.cells - 2), shape) == (0, None)


@SHAPES
def test_cell_without_candidates_has_no_solution(shape):
    # Row 1 holds 2..size, and the cell below its gap holds 1: no repeats, but no digit fits.
    row = "0" + "".join(str(d) for d in range(2, shape.size + 1))
    grid = set_cells(row + "0" * (shape.cells - shape.size), {shape.size: "1"})
    assert count_solutions(grid, shape) == (0, None)


@pytest.mark.parametrize(
    ("shape", "grid"),
    [
        (SUDOKU_9X9, "0" * 80),
        (SUDOKU_6X6, "0" * 81),
        (SUDOKU_9X9, "." * 81),
        (SUDOKU_6X6, "7" + "0" * 35),
    ],
)
def test_bad_input_raises(shape, grid):
    with pytest.raises(ValueError):
        count_solutions(grid, shape)


def test_limit_must_be_positive():
    with pytest.raises(ValueError, match="limit"):
        count_solutions(SPEC_GIVENS, limit=0)
