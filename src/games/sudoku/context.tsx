import { createContext, type ReactNode, useContext } from 'react';
import { type StoreApi, useStore } from 'zustand';

import type { SudokuState } from './store';

// Each puzzle has its own store, so components find theirs through the nearest provider
// instead of importing one global store.
const SudokuStoreContext = createContext<StoreApi<SudokuState> | null>(null);

export function SudokuStoreProvider({
  store,
  children,
}: {
  store: StoreApi<SudokuState>;
  children: ReactNode;
}) {
  return <SudokuStoreContext value={store}>{children}</SudokuStoreContext>;
}

// Reads from this puzzle's store, like Zustand's own hook: the component re-renders only when
// the selected value changes.
export function useSudoku<T>(selector: (state: SudokuState) => T): T {
  const store = useContext(SudokuStoreContext);
  if (store === null) {
    throw new Error('useSudoku must be used inside a SudokuStoreProvider');
  }
  return useStore(store, selector);
}
