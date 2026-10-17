import pytest

from sudoku.shape import SUDOKU_6X6, SUDOKU_9X9, Shape

SHAPES = pytest.mark.parametrize("shape", [SUDOKU_9X9, SUDOKU_6X6], ids=["9x9", "6x6"])


def test_sizes():
    assert (SUDOKU_9X9.size, SUDOKU_9X9.cells) == (9, 81)
    assert (SUDOKU_6X6.size, SUDOKU_6X6.cells) == (6, 36)


@pytest.mark.parametrize(
    ("solo_c", "solo_r", "shape"), [(3, 3, SUDOKU_9X9), (2, 3, SUDOKU_6X6)], ids=["3x3", "2x3"]
)
def test_boxes_match_solo(solo_c, solo_r, shape):
    # solo.c: whichblock[y*cr+x] = (y/c) * c + (x/r), for Solo params "<c>x<r>".
    cr = solo_c * solo_r
    for y in range(cr):
        for x in range(cr):
            assert shape.boxes[y * cr + x] == (y // solo_c) * solo_c + x // solo_r, (y, x)


def test_6x6_boxes_are_3_wide_and_2_tall():
    top_left = [r * 6 + c for r in range(2) for c in range(3)]
    assert {SUDOKU_6X6.boxes[i] for i in top_left} == {0}
    assert SUDOKU_6X6.boxes[0 * 6 + 3] == 1  # row 1, column 4 starts the next box across
    assert SUDOKU_6X6.boxes[2 * 6 + 0] == 2  # row 3, column 1 starts the next box down
    assert SUDOKU_6X6.boxes[2 * 6 + 4] == 3


@SHAPES
def test_every_cell_is_in_one_row_column_and_box(shape):
    assert len(shape.units) == 3 * shape.size
    assert all(len(cells) == shape.size for _, _, cells in shape.units)
    for i in range(shape.cells):
        kinds = sorted(kind for kind, _, cells in shape.units if i in cells)
        assert kinds == ["box", "column", "row"]


@pytest.mark.parametrize(("width", "height"), [(4, 3), (0, 3), (3, 0)])
def test_unsupported_shapes_are_rejected(width, height):
    with pytest.raises(ValueError):
        Shape(width, height)


@SHAPES
def test_check_format_accepts_digits_up_to_the_size(shape):
    shape.check_format("0" * (shape.cells - 1) + str(shape.size))


@pytest.mark.parametrize(
    ("shape", "grid", "message"),
    [
        (SUDOKU_9X9, "0" * 80, "needs 81 characters, got 80"),
        (SUDOKU_6X6, "0" * 81, "needs 36 characters, got 81"),
        (SUDOKU_9X9, "." + "0" * 80, "row 1, column 1 is '.'"),
        (
            SUDOKU_6X6,
            "0" * 7 + "7" + "0" * 28,
            "row 2, column 2 is '7'; expected a digit from 0 to 6",
        ),
    ],
)
def test_check_format_rejects_bad_grids(shape, grid, message):
    with pytest.raises(ValueError, match=message):
        shape.check_format(grid)
