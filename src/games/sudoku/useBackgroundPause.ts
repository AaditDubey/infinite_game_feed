import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSudokuStore } from './store';

// Pauses the timer while the app is in the background: another app, the home screen or a
// locked phone. iOS's brief "inactive" state (Control Center, Notification Center, the app
// switcher, an incoming-call banner) leaves the app on screen, so the timer keeps running.
// The play time is saved there anyway, because the app switcher can close the app straight
// from that state, with no background event first.
export function useBackgroundPause() {
  const pauseTimer = useSudokuStore((state) => state.pauseTimer);
  const resumeTimer = useSudokuStore((state) => state.resumeTimer);
  const saveNow = useSudokuStore((state) => state.saveNow);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        pauseTimer(); // the store saves the paused timer
      } else if (state === 'inactive') {
        saveNow();
      } else if (state === 'active') {
        resumeTimer();
      }
    });
    return () => subscription.remove();
  }, [pauseTimer, resumeTimer, saveNow]);
}
