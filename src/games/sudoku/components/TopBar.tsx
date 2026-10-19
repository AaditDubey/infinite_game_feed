import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme/theme';
import * as stopwatch from '@/timer/stopwatch';

import { useSudoku } from '../context';
import { BAND_LABELS } from '../types';

export function TopBar() {
  const band = useSudoku((state) => state.game.puzzle.band);
  const mistakes = useSudoku((state) => state.game.mistakes);

  return (
    <View style={styles.bar}>
      <Text style={[styles.side, styles.left]}>{BAND_LABELS[band]}</Text>
      <Clock />
      <Text style={[styles.side, styles.right]}>Mistakes {mistakes}</Text>
    </View>
  );
}

const TICK_MS = 250;

// Only the clock redraws while the timer runs, a few times a second, so the board doesn't.
// Between ticks `now` can trail the timer's start; the stopwatch then counts zero for the
// running stretch, which is what a new or just-resumed timer should show.
function Clock() {
  const timer = useSudoku((state) => state.timer);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.runningSince === null) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [timer]);

  return <Text style={styles.clock}>{stopwatch.formatClock(stopwatch.elapsedMs(timer, now))}</Text>;
}

const styles = StyleSheet.create({
  bar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.colors.textMuted,
  },
  left: {
    textAlign: 'left',
  },
  right: {
    textAlign: 'right',
  },
  clock: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: theme.colors.text,
  },
});
