"""Count Sudoku solutions, stopping at a limit.

This is our own solver, independent of Tatham's code. The pipeline uses it to prove that
every generated puzzle has exactly one solution.
"""

from sudoku.shape import SUDOKU_9X9, Shape


def count_solutions(
    givens: str, shape: Shape = SUDOKU_9X9, limit: int = 2
) -> tuple[int, str | None]:
    """Count the solutions of givens, stopping once `limit` have been found.

    Returns (count, solution): solution is the first one found, or None if there are none.
    Givens that already break a rule (a digit twice in a row, column or box) have 0
    solutions. Raises ValueError if givens isn't a grid of this shape.
    """
    shape.check_format(givens)
    if limit < 1:
        raise ValueError("limit must be at least 1")

    # Digit d is bit d, so a row, column or box's used digits fit in one int.
    all_digits = ((1 << shape.size) - 1) << 1
    rows, cols, boxes = shape.rows, shape.cols, shape.boxes
    row_used = [0] * shape.size
    col_used = [0] * shape.size
    box_used = [0] * shape.size
    grid = [int(ch) for ch in givens]
    empty = []

    for i, digit in enumerate(grid):
        if digit == 0:
            empty.append(i)
            continue
        bit = 1 << digit
        r, c, b = rows[i], cols[i], boxes[i]
        if (row_used[r] | col_used[c] | box_used[b]) & bit:
            return 0, None
        row_used[r] |= bit
        col_used[c] |= bit
        box_used[b] |= bit

    count = 0
    first: str | None = None

    def search() -> bool:
        """Fill the remaining empty cells; return True once `limit` solutions are found."""
        nonlocal count, first
        if not empty:
            count += 1
            if first is None:
                first = "".join(map(str, grid))
            return count >= limit

        # Fill the cell with the fewest candidates first: that keeps the search small.
        best, best_mask, best_n = -1, 0, shape.size + 1
        for k, i in enumerate(empty):
            mask = all_digits & ~(row_used[rows[i]] | col_used[cols[i]] | box_used[boxes[i]])
            n = mask.bit_count()
            if n < best_n:
                best, best_mask, best_n = k, mask, n
                if n <= 1:
                    break
        if best_n == 0:
            return False  # dead end: some cell has no digit left

        # Take the cell out of `empty` (swap with the last), and put it back afterwards.
        i = empty[best]
        empty[best] = empty[-1]
        empty.pop()
        r, c, b = rows[i], cols[i], boxes[i]
        mask = best_mask
        while mask:
            bit = mask & -mask  # lowest remaining candidate
            mask ^= bit
            row_used[r] |= bit
            col_used[c] |= bit
            box_used[b] |= bit
            grid[i] = bit.bit_length() - 1
            done = search()
            row_used[r] ^= bit
            col_used[c] ^= bit
            box_used[b] ^= bit
            if done:
                return True  # nothing runs after this, so no need to restore the rest
        grid[i] = 0
        empty.append(i)
        empty[best], empty[-1] = empty[-1], empty[best]
        return False

    search()
    return count, first
