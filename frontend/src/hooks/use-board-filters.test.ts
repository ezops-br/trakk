import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock next/navigation before importing the hook
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
  useRouter: vi.fn(),
  usePathname: vi.fn(),
}));

import { useBoardFilters } from '@/hooks/use-board-filters';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { UNASSIGNED_SENTINEL } from '@/lib/types';

const mockUseSearchParams = useSearchParams as ReturnType<typeof vi.fn>;
const mockUseRouter = useRouter as ReturnType<typeof vi.fn>;
const mockUsePathname = usePathname as ReturnType<typeof vi.fn>;

function makeSearchParams(params: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams(params);
}

describe('useBoardFilters', () => {
  const mockReplace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRouter.mockReturnValue({ replace: mockReplace });
    mockUsePathname.mockReturnValue('/projects/proj-1/board');
    mockUseSearchParams.mockReturnValue(makeSearchParams());
  });

  it('returns empty filters and hasActiveFilters=false when URL has no filter params', () => {
    // Arrange — no search params set
    mockUseSearchParams.mockReturnValue(makeSearchParams());

    // Act
    const { result } = renderHook(() => useBoardFilters());

    // Assert
    expect(result.current.filters.assigneeIds).toEqual([]);
    expect(result.current.filters.priorities).toEqual([]);
    expect(result.current.filters.labelIds).toEqual([]);
    expect(result.current.filters.search).toBe('');
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('parses assignee, priority, label, and search params from the URL', () => {
    // Arrange — use real UUID v4 values (validator now enforces UUID v4 or UNASSIGNED_SENTINEL)
    const userId1 = '550e8400-e29b-4d41-a716-446655440001';
    const userId2 = '550e8400-e29b-4d41-a716-446655440002';
    const labelId1 = '550e8400-e29b-4d41-a716-446655440010';
    mockUseSearchParams.mockReturnValue(makeSearchParams({
      assignee: `${userId1},${userId2}`,
      priority: 'HIGH,LOW',
      label: labelId1,
      search: 'login bug',
    }));

    // Act
    const { result } = renderHook(() => useBoardFilters());

    // Assert
    expect(result.current.filters.assigneeIds).toEqual([userId1, userId2]);
    expect(result.current.filters.priorities).toEqual(['HIGH', 'LOW']);
    expect(result.current.filters.labelIds).toEqual([labelId1]);
    expect(result.current.filters.search).toBe('login bug');
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('drops invalid priority values during parsing', () => {
    // Arrange — "CRITICAL" is not a valid Priority value
    mockUseSearchParams.mockReturnValue(makeSearchParams({
      priority: 'HIGH,CRITICAL,LOW',
    }));

    // Act
    const { result } = renderHook(() => useBoardFilters());

    // Assert
    expect(result.current.filters.priorities).toEqual(['HIGH', 'LOW']);
  });

  it('setAssigneeIds calls router.replace with the correct URL and preserves ticket param', () => {
    // Arrange — existing ticket param in URL
    mockUseSearchParams.mockReturnValue(makeSearchParams({ ticket: '42' }));

    // Act
    const { result } = renderHook(() => useBoardFilters());
    act(() => {
      result.current.setAssigneeIds(['user-1', 'user-2']);
    });

    // Assert
    expect(mockReplace).toHaveBeenCalledOnce();
    const calledUrl = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).toContain('assignee=user-1%2Cuser-2');
    expect(calledUrl).toContain('ticket=42');
    expect(mockReplace.mock.calls[0][1]).toEqual({ scroll: false });
  });

  it('setAssigneeIds with empty array removes the assignee param from the URL', () => {
    // Arrange
    mockUseSearchParams.mockReturnValue(makeSearchParams({ assignee: 'user-1' }));

    // Act
    const { result } = renderHook(() => useBoardFilters());
    act(() => {
      result.current.setAssigneeIds([]);
    });

    // Assert
    const calledUrl = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('assignee');
  });

  it('clearAll removes assignee, priority, label, and search params but keeps ticket param', () => {
    // Arrange — filters + ticket param in URL
    mockUseSearchParams.mockReturnValue(makeSearchParams({
      assignee: 'user-1',
      priority: 'HIGH',
      label: 'label-1',
      search: 'bug',
      ticket: '99',
    }));

    // Act
    const { result } = renderHook(() => useBoardFilters());
    act(() => {
      result.current.clearAll();
    });

    // Assert
    const calledUrl = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('assignee');
    expect(calledUrl).not.toContain('priority');
    expect(calledUrl).not.toContain('label');
    expect(calledUrl).not.toContain('search');
    expect(calledUrl).toContain('ticket=99');
  });

  it('whitespace-only search is normalized to empty string', () => {
    // Arrange
    mockUseSearchParams.mockReturnValue(makeSearchParams({ search: '   ' }));

    // Act
    const { result } = renderHook(() => useBoardFilters());

    // Assert
    expect(result.current.filters.search).toBe('');
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('UNASSIGNED_SENTINEL value is preserved through round-trip parsing', () => {
    // Arrange
    mockUseSearchParams.mockReturnValue(makeSearchParams({ assignee: UNASSIGNED_SENTINEL }));

    // Act
    const { result } = renderHook(() => useBoardFilters());

    // Assert
    expect(result.current.filters.assigneeIds).toContain(UNASSIGNED_SENTINEL);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('setPriorities with values updates the URL priority param', () => {
    // Arrange
    mockUseSearchParams.mockReturnValue(makeSearchParams());

    // Act
    const { result } = renderHook(() => useBoardFilters());
    act(() => {
      result.current.setPriorities(['URGENT', 'HIGH']);
    });

    // Assert
    const calledUrl = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).toContain('priority=');
    expect(calledUrl).toContain('URGENT');
    expect(calledUrl).toContain('HIGH');
  });

  it('setSearch with non-empty string updates the URL search param', () => {
    // Arrange
    mockUseSearchParams.mockReturnValue(makeSearchParams());

    // Act
    const { result } = renderHook(() => useBoardFilters());
    act(() => {
      result.current.setSearch('login bug');
    });

    // Assert
    const calledUrl = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).toContain('search=login+bug');
    expect(mockReplace.mock.calls[0][1]).toEqual({ scroll: false });
  });

  // --- Due date filter ---------------------------------------------------

  it('setDueDateFilter("overdue") sets the enum and clears any custom range', () => {
    // Arrange — start with a stale custom range in the URL
    mockUseSearchParams.mockReturnValue(makeSearchParams({
      dueDateFrom: '2026-07-20',
      dueDateTo: '2026-07-25',
    }));

    // Act
    const { result } = renderHook(() => useBoardFilters());
    act(() => {
      result.current.setDueDateFilter('overdue');
      // Simulate what Next.js router does in production: update the URL
      // that useSearchParams exposes on the next render.
      mockUseSearchParams.mockReturnValue(makeSearchParams({ dueDateFilter: 'overdue' }));
    });
    // Re-read after the URL changed so the hook's useMemos re-parse.
    const { result: result2 } = renderHook(() => useBoardFilters());

    // Assert
    expect(result2.current.filters.dueDateFilter).toBe('overdue');
    expect(result2.current.filters.dueDateFrom).toBeUndefined();
    expect(result2.current.filters.dueDateTo).toBeUndefined();
    expect(result2.current.hasActiveFilters).toBe(true);

    const calledUrl = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).toContain('dueDateFilter=overdue');
    expect(calledUrl).not.toContain('dueDateFrom');
    expect(calledUrl).not.toContain('dueDateTo');
  });

  it('setDueDateFilter(undefined, from, to) sets a custom range and clears the enum', () => {
    // Arrange — start with a stale enum in the URL
    mockUseSearchParams.mockReturnValue(makeSearchParams({
      dueDateFilter: 'overdue',
    }));

    // Act
    const { result } = renderHook(() => useBoardFilters());
    act(() => {
      result.current.setDueDateFilter(undefined, '2026-07-20', '2026-07-25');
      // Simulate router-replace triggering re-read of the URL.
      mockUseSearchParams.mockReturnValue(makeSearchParams({
        dueDateFrom: '2026-07-20',
        dueDateTo: '2026-07-25',
      }));
    });
    const { result: result2 } = renderHook(() => useBoardFilters());

    // Assert
    expect(result2.current.filters.dueDateFilter).toBeUndefined();
    expect(result2.current.filters.dueDateFrom).toBe('2026-07-20');
    expect(result2.current.filters.dueDateTo).toBe('2026-07-25');
    expect(result2.current.hasActiveFilters).toBe(true);

    const calledUrl = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('dueDateFilter');
    expect(calledUrl).toContain('dueDateFrom=2026-07-20');
    expect(calledUrl).toContain('dueDateTo=2026-07-25');
  });

  it('setDueDateFilter() with no args clears all three fields', () => {
    // Arrange — all three fields populated in the URL
    mockUseSearchParams.mockReturnValue(makeSearchParams({
      dueDateFilter: 'overdue',
      dueDateFrom: '2026-07-20',
      dueDateTo: '2026-07-25',
    }));

    // Act
    const { result } = renderHook(() => useBoardFilters());
    act(() => {
      result.current.setDueDateFilter();
      // Simulate router-replace triggering re-read of the URL.
      mockUseSearchParams.mockReturnValue(makeSearchParams());
    });
    const { result: result2 } = renderHook(() => useBoardFilters());

    // Assert
    expect(result2.current.filters.dueDateFilter).toBeUndefined();
    expect(result2.current.filters.dueDateFrom).toBeUndefined();
    expect(result2.current.filters.dueDateTo).toBeUndefined();
    expect(result2.current.hasActiveFilters).toBe(false);

    const calledUrl = mockReplace.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('dueDateFilter');
    expect(calledUrl).not.toContain('dueDateFrom');
    expect(calledUrl).not.toContain('dueDateTo');
  });

  it('round-trips ?dueDateFilter=overdue from the URL into filters', () => {
    // Arrange
    mockUseSearchParams.mockReturnValue(makeSearchParams({
      dueDateFilter: 'overdue',
    }));

    // Act
    const { result } = renderHook(() => useBoardFilters());

    // Assert
    expect(result.current.filters.dueDateFilter).toBe('overdue');
    expect(result.current.hasActiveFilters).toBe(true);
  });
});
