import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import type { StoreApi } from 'zustand';

import { useSudokuSession } from './session';
import type { SudokuState } from './store';

// Loads the saved game when the screen opens. The splash screen stays up until then (see
// _layout.tsx), so the board never shows a puzzle that's about to be replaced. Returns the
// store of the puzzle to show, or null while it's still loading.
export function useRestore(): StoreApi<SudokuState> | null {
  const page = useSudokuSession((state) => state.page);
  const restore = useSudokuSession((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  // Effects run after the render they belong to, so the board is already drawn underneath.
  const ready = page !== null;
  useEffect(() => {
    if (ready) {
      SplashScreen.hide();
    }
  }, [ready]);

  return page;
}
