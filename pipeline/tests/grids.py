"""Grids built by code for the solver and verifier tests, so every expected result is provable."""

from collections.abc import Iterable

from sudoku.shape import Shape

# The spec's sample puzzle and solution (docs/phase_1.md, "Pack format").
SPEC_GIVENS = "530070000600195000098000060800060003400803001700020006060000280000419005000080079"
SPEC_SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179"


def formula_grid(shape: Shape) -> str:
    """A solved grid for any shape: every row is the first row shifted, so no unit repeats."""
    size, w, h = shape.size, shape.block_width, shape.block_height
    return "".join(
        str((w * (r % h) + r // h + c) % size + 1) for r in range(size) for c in range(size)
    )


def is_solved_by_sets(grid: str, shape: Shape) -> bool:
    """Check a solved grid without Shape's tables: each row, column and box holds 1..size once."""
    size, w, h = shape.size, shape.block_width, shape.block_height
    if len(grid) != size * size:
        return False
    rows = [grid[r * size : (r + 1) * size] for r in range(size)]
    cols = [grid[c::size] for c in range(size)]
    boxes = [
        "".join(grid[(top + y) * size + left + x] for y in range(h) for x in range(w))
        for top in range(0, size, h)
        for left in range(0, size, w)
    ]
    digits = sorted("123456789"[:size])
    return all(sorted(unit) == digits for unit in rows + cols + boxes)


def blank(grid: str, cells: Iterable[int]) -> str:
    """Return grid with the given cells emptied."""
    out = list(grid)
    for i in cells:
        out[i] = "0"
    return "".join(out)


def set_cells(grid: str, values: dict[int, str]) -> str:
    """Return grid with some cells replaced."""
    out = list(grid)
    for i, ch in values.items():
        out[i] = ch
    return "".join(out)


def one_blank_per_box(shape: Shape) -> list[int]:
    """One cell from each box, no two in the same row or column.

    Boxes are arranged block_height across and block_width down, so box (down, across)
    gives the cell at row down * block_height + across, column across * block_width + down.
    """
    size, w, h = shape.size, shape.block_width, shape.block_height
    return [
        (down * h + across) * size + across * w + down for down in range(w) for across in range(h)
    ]


def find_deadly_rectangle(grid: str, shape: Shape) -> tuple[int, int, int, int] | None:
    """Find cells (r1,c1), (r1,c2), (r2,c1), (r2,c2) in exactly two boxes, holding a b / b a.

    Blanking only these four leaves exactly two solutions: the grid and the a/b swap. Each
    row and column is missing {a, b} either way, and each box holds one same-row or
    same-column pair, so both fillings are valid and nothing else fits.
    """
    size = shape.size
    for r1 in range(size):
        for r2 in range(r1 + 1, size):
            for c1 in range(size):
                for c2 in range(c1 + 1, size):
                    cells = (r1 * size + c1, r1 * size + c2, r2 * size + c1, r2 * size + c2)
                    if len({shape.boxes[i] for i in cells}) != 2:
                        continue
                    a, b, b2, a2 = (grid[i] for i in cells)
                    if a == a2 and b == b2 and a != b:
                        return cells
    return None
