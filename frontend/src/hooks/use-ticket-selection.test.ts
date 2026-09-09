import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useTicketSelection,
  SELECTION_CAP,
} from '@/hooks/use-ticket-selection';

describe('useTicketSelection', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useTicketSelection());
    expect(result.current.count).toBe(0);
    expect(result.current.hasSelection).toBe(false);
    expect(result.current.selectedNumbers.size).toBe(0);
  });

  it('toggleSelect adds then removes', () => {
    const { result } = renderHook(() => useTicketSelection());
    act(() => result.current.toggleSelect(42));
    expect(result.current.isSelected(42)).toBe(true);
    expect(result.current.count).toBe(1);
    act(() => result.current.toggleSelect(42));
    expect(result.current.isSelected(42)).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('caps toggles at SELECTION_CAP (default 100)', () => {
    const { result } = renderHook(() => useTicketSelection());
    act(() => {
      for (let i = 1; i <= SELECTION_CAP; i++) result.current.toggleSelect(i);
    });
    expect(result.current.count).toBe(SELECTION_CAP);
    expect(result.current.capReached).toBe(false);

    // The 101st distinct toggle is a silent no-op.
    act(() => result.current.toggleSelect(SELECTION_CAP + 1));
    expect(result.current.count).toBe(SELECTION_CAP);
    expect(result.current.isSelected(SELECTION_CAP + 1)).toBe(false);
    expect(result.current.capReached).toBe(true);

    // Toggling an existing member still works (deletion clears the cap state).
    act(() => result.current.toggleSelect(1));
    expect(result.current.count).toBe(SELECTION_CAP - 1);
    expect(result.current.capReached).toBe(false);
  });

  it('selectAll truncates to the cap', () => {
    const { result } = renderHook(() => useTicketSelection());
    const ids = Array.from({ length: SELECTION_CAP + 25 }, (_, i) => i + 1);
    act(() => result.current.selectAll(ids));
    expect(result.current.count).toBe(SELECTION_CAP);
    expect(result.current.isSelected(1)).toBe(true);
    expect(result.current.isSelected(SELECTION_CAP)).toBe(true);
    expect(result.current.isSelected(SELECTION_CAP + 1)).toBe(false);
    expect(result.current.capReached).toBe(true);
  });

  it('clearAll empties the set', () => {
    const { result } = renderHook(() => useTicketSelection());
    act(() => {
      result.current.toggleSelect(1);
      result.current.toggleSelect(2);
    });
    expect(result.current.count).toBe(2);
    act(() => result.current.clearAll());
    expect(result.current.count).toBe(0);
    expect(result.current.hasSelection).toBe(false);
  });
});
