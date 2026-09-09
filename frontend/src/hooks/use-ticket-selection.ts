'use client';

import React, { useCallback, useMemo, useState } from 'react';

/**
 * Hard cap on concurrent selection size. The spec leaves the exact threshold
 * open; we default to 100 tickets per operation, matching the brief.
 */
export const SELECTION_CAP = 100;

export interface UseTicketSelectionResult {
  selectedNumbers: Set<number>;
  toggleSelect: (n: number) => void;
  selectAll: (ns: number[]) => void;
  clearAll: () => void;
  isSelected: (n: number) => boolean;
  hasSelection: boolean;
  count: number;
  /** True when the most recent toggle was a no-op due to the cap. Resets after a successful toggle. */
  capReached: boolean;
}

export function useTicketSelection(): UseTicketSelectionResult {
  const [selected, setSelected] = useState<Set<number>>(() => new Set<number>());
  const [capReached, setCapReached] = useState(false);

  const toggleSelect = useCallback((n: number) => {
    setSelected((prev) => {
      if (prev.has(n)) {
        const next = new Set(prev);
        next.delete(n);
        setCapReached(false);
        return next;
      }
      if (prev.size >= SELECTION_CAP) {
        // Silent no-op per the brief; expose capReached so the UI can surface
        // a notice (e.g. "Selection limited to 100 tickets").
        setCapReached(true);
        return prev;
      }
      const next = new Set(prev);
      next.add(n);
      setCapReached(false);
      return next;
    });
  }, []);

  const selectAll = useCallback((ns: number[]) => {
    // Cap is enforced here, not in the API.
    setSelected(new Set(ns.slice(0, SELECTION_CAP)));
    setCapReached(ns.length > SELECTION_CAP);
  }, []);

  const clearAll = useCallback(() => {
    setSelected(new Set());
    setCapReached(false);
  }, []);

  const isSelected = useCallback((n: number) => selected.has(n), [selected]);

  return useMemo<UseTicketSelectionResult>(
    () => ({
      selectedNumbers: selected,
      toggleSelect,
      selectAll,
      clearAll,
      isSelected,
      hasSelection: selected.size > 0,
      count: selected.size,
      capReached,
    }),
    [selected, toggleSelect, selectAll, clearAll, isSelected, capReached],
  );
}
