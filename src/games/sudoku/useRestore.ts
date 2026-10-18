import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { useSudokuStore } from './store';

// Loads the saved game when the screen opens. The splash screen stays up until then (see
// _layout.tsx), so the board never shows a puzzle that's about to be replaced. Returns whether
// the game is ready to show.
export function useRestore(): boolean {
  const ready = useSudokuStore((state) => state.ready);
  const restore = useSudokuStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  // Effects run after the render they belong to, so the board is already drawn underneath.
  useEffect(() => {
    if (ready) {
      SplashScreen.hide();
    }
  }, [ready]);

  return ready;
}
