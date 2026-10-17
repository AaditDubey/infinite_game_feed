"""Sudoku grid shapes: how a grid splits into rows, columns and blocks.

Grids are strings, row-major, one character per cell: '0' for empty and '1' up to the
grid size for a digit. That's why a shape's size is capped at 9.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Shape:
    """A size x size grid divided into blocks block_width cells wide and block_height tall."""

    block_width: int
    block_height: int
    size: int = field(init=False)
    cells: int = field(init=False)
    # Per cell (row-major index): its row, column and box, all 0-based.
    rows: tuple[int, ...] = field(init=False, repr=False, compare=False)
    cols: tuple[int, ...] = field(init=False, repr=False, compare=False)
    boxes: tuple[int, ...] = field(init=False, repr=False, compare=False)
    # Every row, column and box as (kind, 1-based number, cell indices), for messages.
    units: tuple[tuple[str, int, tuple[int, ...]], ...] = field(
        init=False, repr=False, compare=False
    )

    def __post_init__(self) -> None:
        if self.block_width < 1 or self.block_height < 1:
            raise ValueError("block sides must be at least 1")
        size = self.block_width * self.block_height
        if size > 9:
            raise ValueError(f"grid size {size} is over 9; cells are single characters")

        cells = size * size
        rows = tuple(i // size for i in range(cells))
        cols = tuple(i % size for i in range(cells))
        boxes_across = size // self.block_width
        boxes = tuple(
            (r // self.block_height) * boxes_across + c // self.block_width
            for r, c in zip(rows, cols)
        )
        units = []
        for kind, index in (("row", rows), ("column", cols), ("box", boxes)):
            for n in range(size):
                units.append((kind, n + 1, tuple(i for i in range(cells) if index[i] == n)))

        # Frozen dataclass: derived fields have to be set through object.__setattr__.
        for name, value in (
            ("size", size),
            ("cells", cells),
            ("rows", rows),
            ("cols", cols),
            ("boxes", boxes),
            ("units", tuple(units)),
        ):
            object.__setattr__(self, name, value)

    def check_format(self, grid: str) -> None:
        """Raise ValueError unless grid has one character per cell, each '0' to the size."""
        if len(grid) != self.cells:
            raise ValueError(
                f"a {self.size}x{self.size} grid needs {self.cells} characters, got {len(grid)}"
            )
        allowed = "0123456789"[: self.size + 1]
        for i, ch in enumerate(grid):
            if ch not in allowed:
                raise ValueError(
                    f"row {self.rows[i] + 1}, column {self.cols[i] + 1} is {ch!r}; "
                    f"expected a digit from 0 to {self.size}"
                )


SUDOKU_9X9 = Shape(block_width=3, block_height=3)

# Solo's "2x3": a 6x6 grid in six blocks 3 wide and 2 tall. solo.c assigns blocks with
# whichblock = (y / c) * c + (x / r), where c = 2 and r = 3.
SUDOKU_6X6 = Shape(block_width=3, block_height=2)
