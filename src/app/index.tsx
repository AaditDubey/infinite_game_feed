import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BandPicker } from '@/games/sudoku/components/BandPicker';
import { Board } from '@/games/sudoku/components/Board';
import { NumberPad } from '@/games/sudoku/components/NumberPad';
import { SolvedPanel } from '@/games/sudoku/components/SolvedPanel';
import { Toolbar } from '@/games/sudoku/components/Toolbar';
import { TopBar } from '@/games/sudoku/components/TopBar';
import { useSudokuStore } from '@/games/sudoku/store';
import { useBackgroundPause } from '@/games/sudoku/useBackgroundPause';
import { theme } from '@/theme/theme';

export default function Index() {
  const solved = useSudokuStore((state) => state.game.solved);
  useBackgroundPause();

  return (
    <SafeAreaView style={styles.container}>
      <TopBar />
      <BandPicker />
      <Board />
      {solved ? (
        <SolvedPanel />
      ) : (
        <>
          <NumberPad />
          <Toolbar />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
});
