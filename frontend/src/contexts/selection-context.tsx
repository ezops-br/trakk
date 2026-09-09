'use client';

import React, { createContext, useContext } from 'react';
import {
  useTicketSelection,
  SELECTION_CAP,
  type UseTicketSelectionResult,
} from '@/hooks/use-ticket-selection';

const SelectionContext = createContext<UseTicketSelectionResult | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const value = useTicketSelection();
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelectionContext(): UseTicketSelectionResult {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error(
      'useSelectionContext must be used inside <SelectionProvider>',
    );
  }
  return ctx;
}

export { SELECTION_CAP };
