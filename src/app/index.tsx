import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Board } from '@/games/sudoku/components/Board';
import { NumberPad } from '@/games/sudoku/components/NumberPad';
import { Toolbar } from '@/games/sudoku/components/Toolbar';
import { theme } from '@/theme/theme';

export default function Index() {
  return (
    <SafeAreaView style={styles.container}>
      <Board />
      <NumberPad />
      <Toolbar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
});
