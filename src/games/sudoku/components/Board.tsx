import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { theme } from '@/theme/theme';

import { highlights } from '../engine';
import { useSudokuStore } from '../store';
import { Cell } from './Cell';
import { boxGrid } from './layout';

// The board is the largest square that fits the space it's given, so short phones still show
// the number pad and toolbar. It measures that space first, so it appears one frame later.
//
// The lines are gaps between cells that let the background show through: the board's dark
// background between boxes, each box's light background between its cells. So every cell
// gets exactly the same size.
export function Board() {
  const game = useSudokuStore((state) => state.game);
  const selected = useSudokuStore((state) => state.selected);
  const flash = useSudokuStore((state) => state.flash);
  const select = useSudokuStore((state) => state.select);
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSpace({ width, height });
  };

  if (space === null) {
    return <View style={styles.space} onLayout={onLayout} />;
  }

  const size = game.puzzle.size;
  const side = Math.floor(Math.min(space.width, space.height));
  const cellWidth = side / size; // the lines take a few points, which text sizes can ignore
  const marks = highlights(game, selected);
  const flashing = new Set(flash.cells);

  return (
    <View style={styles.space} onLayout={onLayout}>
      <View style={[styles.board, { width: side, height: side }]}>
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
                        flashId={flashing.has(index) ? flash.id : 0}
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
    </View>
  );
}

const styles = StyleSheet.create({
  space: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
