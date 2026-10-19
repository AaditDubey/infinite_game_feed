import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSudokuSession } from './session';

// Pauses the timer while the app is in the background: another app, the home screen or a
// locked phone. iOS's brief "inactive" state (Control Center, Notification Center, the app
// switcher, an incoming-call banner) leaves the app on screen, so the timer keeps running.
// The play time is saved there anyway, because the app switcher can close the app straight
// from that state, with no background event first.
export function useBackgroundPause() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Whichever puzzle is on screen when the event arrives; Next puzzle swaps it.
      const page = useSudokuSession.getState().page?.getState();
      if (page === undefined) {
        return;
      }
      if (state === 'background') {
        page.deactivate(Date.now()); // the store saves the paused timer
      } else if (state === 'inactive') {
        page.saveNow();
      } else if (state === 'active') {
        page.activate(Date.now());
      }
    });
    return () => subscription.remove();
  }, []);
}
