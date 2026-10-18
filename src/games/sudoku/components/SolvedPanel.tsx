import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme/theme';
import * as stopwatch from '@/timer/stopwatch';

import { useSudokuStore } from '../store';

// Takes the place of the number pad and toolbar once the puzzle is solved, at the same height,
// so the board stays where it is.
export function SolvedPanel() {
  const mistakes = useSudokuStore((state) => state.game.mistakes);
  const timer = useSudokuStore((state) => state.timer);
  const nextPuzzle = useSudokuStore((state) => state.nextPuzzle);

  // The timer stopped at the solving move, so the time it has counted is final.
  const time = stopwatch.formatClock(timer.elapsedMs);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Solved!</Text>
      <Text style={styles.stats}>
        Time {time} · {mistakes} {mistakes === 1 ? 'mistake' : 'mistakes'}
      </Text>
      <Pressable
        onPress={nextPuzzle}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.buttonLabel}>Next puzzle</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignSelf: 'stretch',
    minHeight: 2 * theme.button.height + theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.text,
  },
  stats: {
    fontSize: theme.fontSize.md,
    fontVariant: ['tabular-nums'],
    color: theme.colors.textMuted,
  },
  button: {
    alignSelf: 'stretch',
    height: theme.button.height,
    marginTop: theme.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.button.radius,
    backgroundColor: theme.colors.buttonActive,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.buttonActiveText,
  },
});
