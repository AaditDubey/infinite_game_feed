import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme/theme';

import { useSudoku } from '../context';
import { completedDigits } from '../engine';
import { DIGITS } from '../types';

// A digit with every copy placed correctly is dimmed and can't be tapped: it has no cell left.
export function NumberPad() {
  const game = useSudoku((state) => state.game);
  const notesMode = useSudoku((state) => state.notesMode);
  const inputDigit = useSudoku((state) => state.inputDigit);
  const done = completedDigits(game);

  return (
    <View style={styles.pad}>
      {DIGITS.slice(0, game.puzzle.size).map((digit) => {
        const complete = done.includes(digit);
        return (
          <Pressable
            key={digit}
            disabled={complete}
            onPress={() => inputDigit(digit)}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
            accessibilityRole="button"
            accessibilityLabel={notesMode ? `Note ${digit}` : `${digit}`}
            accessibilityState={{ disabled: complete }}
          >
            <Text style={[styles.keyText, complete && styles.keyTextDone]}>{digit}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  key: {
    flex: 1,
    height: theme.button.height,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.button.radius,
    backgroundColor: theme.colors.button,
  },
  keyPressed: {
    backgroundColor: theme.colors.buttonPressed,
  },
  keyText: {
    fontSize: theme.fontSize.xl,
    color: theme.colors.buttonText,
  },
  keyTextDone: {
    color: theme.colors.buttonTextDone,
  },
});
