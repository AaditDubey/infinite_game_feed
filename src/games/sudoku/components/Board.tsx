import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { theme } from '@/theme/theme';

import { highlights } from '../engine';
import { useSudokuStore } from '../store';
import { Cell } from './Cell';
import { boxGrid } from './layout';

// The lines are gaps between cells that let the background show through: the board's dark
// background between boxes, each box's light background between its cells. So every cell
// gets exactly the same size.
export function Board() {
  const game = useSudokuStore((state) => state.game);
  const selected = useSudokuStore((state) => state.selected);
  const select = useSudokuStore((state) => state.select);
  const { width: screenWidth } = useWindowDimensions();

  const size = game.puzzle.size;
  const boardWidth = screenWidth - 2 * theme.spacing.md;
  const cellWidth = boardWidth / size; // the lines take a few points, which text sizes can ignore
  const marks = highlights(game, selected);

  return (
    <View style={[styles.board, { width: boardWidth, height: boardWidth }]}>
      {boxGrid(size).map((boxRow, boxRowIndex) => (
        <View key={boxRowIndex} style={styles.boxRow}>
          {boxRow.map((box, boxIndex) => (
            <View key={boxIndex} style={styles.box}>
              {box.map((cellRow, cellRowIndex) => (
                <View key={cellRowIndex} style={styles.cellRow}>
                  {cellRow.map((index) => (
                    <Cell
                      key={index}
                      index={index}
                      size={size}
                      cell={game.cells[index]}
                      highlight={marks[index]}
                      width={cellWidth}
                      onPress={select}
                    />
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: theme.colors.boxLine,
    padding: theme.board.boxLineWidth,
    gap: theme.board.boxLineWidth,
  },
  boxRow: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.board.boxLineWidth,
  },
  box: {
    flex: 1,
    backgroundColor: theme.colors.cellLine,
    gap: theme.board.cellLineWidth,
  },
  cellRow: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.board.cellLineWidth,
  },
});
