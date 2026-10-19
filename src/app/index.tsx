import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BandPicker } from '@/games/sudoku/components/BandPicker';
import { Board } from '@/games/sudoku/components/Board';
import { NumberPad } from '@/games/sudoku/components/NumberPad';
import { SolvedPanel } from '@/games/sudoku/components/SolvedPanel';
import { Toolbar } from '@/games/sudoku/components/Toolbar';
import { TopBar } from '@/games/sudoku/components/TopBar';
import { SudokuStoreProvider, useSudoku } from '@/games/sudoku/context';
import { useBackgroundPause } from '@/games/sudoku/useBackgroundPause';
import { useRestore } from '@/games/sudoku/useRestore';
import { theme } from '@/theme/theme';

export default function Index() {
  const page = useRestore();
  useBackgroundPause();

  if (page === null) {
    return null; // the splash screen is still showing
  }

  // Next puzzle swaps the store without redrawing the screen from scratch, so the board keeps
  // its measured size and never flashes empty.
  return (
    <SudokuStoreProvider store={page}>
      <PuzzleScreen />
    </SudokuStoreProvider>
  );
}

function PuzzleScreen() {
  const solved = useSudoku((state) => state.game.solved);

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
