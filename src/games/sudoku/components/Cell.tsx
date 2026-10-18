import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '@/theme/theme';

import type { Highlight } from '../engine';
import { BOX_SHAPES, type CellState, type Digit, type GridSize } from '../types';
import { cellLabel } from './layout';

interface CellProps {
  index: number;
  size: GridSize;
  cell: CellState;
  highlight: Highlight;
  width: number; // the cell's width in points, for text sizes
  flashId: number; // changes to a new non-zero number each time the cell should flash green
  onPress: (index: number) => void;
}

export function Cell({ index, size, cell, highlight, width, flashId, onPress }: CellProps) {
  // A green layer behind the digit fades in and out once. Reanimated runs it on the UI thread,
  // so taps stay responsive while it plays.
  const flash = useSharedValue(0);
  useEffect(() => {
    if (flashId > 0) {
      const half = { duration: theme.board.flashMs / 2 };
      flash.set(withSequence(withTiming(theme.board.flashOpacity, half), withTiming(0, half)));
    }
  }, [flashId, flash]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));

  return (
    <Pressable
      style={[styles.cell, { backgroundColor: background(cell, highlight) }]}
      onPress={() => onPress(index)}
      accessibilityRole="button"
      accessibilityLabel={cellLabel(index, size, cell.value)}
      accessibilityState={{ selected: highlight === 'selected' }}
    >
      <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />
      {cell.value !== null ? (
        <Text
          style={[
            styles.digit,
            { fontSize: Math.round(width * theme.board.digitScale), color: digitColor(cell) },
          ]}
        >
          {cell.value}
        </Text>
      ) : cell.notes.length > 0 ? (
        <Notes notes={cell.notes} size={size} width={width} />
      ) : null}
    </Pressable>
  );
}

// Pencil marks in a small grid shaped like a box: 3×3 on 9×9, 3 wide and 2 tall on 6×6.
function Notes({ notes, size, width }: { notes: Digit[]; size: GridSize; width: number }) {
  const { boxWidth, boxHeight } = BOX_SHAPES[size];
  const fontSize = Math.round(width * theme.board.noteScale);
  return (
    <View style={styles.notes}>
      {Array.from({ length: boxHeight }, (_, row) => (
        <View key={row} style={styles.noteRow}>
          {Array.from({ length: boxWidth }, (_, col) => {
            const digit = row * boxWidth + col + 1;
            return (
              <View key={digit} style={styles.noteSlot}>
                <Text style={[styles.note, { fontSize }]}>
                  {notes.some((note) => note === digit) ? digit : ''}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// A selected cell shows as selected even when its digit is wrong; the red digit still shows.
function background(cell: CellState, highlight: Highlight): string {
  if (highlight === 'selected') return theme.colors.cellSelected;
  if (cell.wrong) return theme.colors.cellWrong;
  if (highlight === 'sameDigit') return theme.colors.cellSameDigit;
  if (highlight === 'peer') return theme.colors.cellPeer;
  return theme.colors.cell;
}

function digitColor(cell: CellState): string {
  if (cell.given) return theme.colors.givenText;
  if (cell.wrong) return theme.colors.wrongText;
  return theme.colors.entryText;
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.unitComplete,
  },
  digit: {
    includeFontPadding: false,
    textAlign: 'center',
  },
  notes: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    padding: 1,
  },
  noteRow: {
    flex: 1,
    flexDirection: 'row',
  },
  noteSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    includeFontPadding: false,
    color: theme.colors.noteText,
  },
});
