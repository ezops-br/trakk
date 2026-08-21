import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock api-client — getWithSignal will exist on apiClient when implementation ships.
// use-search.ts does not exist yet — tests fail with "Cannot find module".
vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
  apiClient: {
    getWithSignal: vi.fn(),
  },
}));

import { useSearch } from '@/hooks/use-search';
import { apiClient } from '@/lib/api-client';

const mockGetWithSignal = apiClient.getWithSignal as ReturnType<typeof vi.fn>;

const MOCK_TICKET = {
  id: '44444444-4444-4444-4444-444444444444',
  number: 5,
  title: 'Fix login bug',
  priority: 'HIGH',
  projectId: '22222222-2222-2222-2222-222222222222',
  projectKey: 'TRAKK',
  projectName: 'Trakk',
  statusColumnName: 'In Progress',
  assigneeName: null,
  assigneeAvatar: null,
  updatedAt: '2026-06-10T10:00:00.000Z',
};

const MOCK_PROJECT = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Trakk',
  key: 'TRAKK',
  description: 'Main project',
  memberCount: 3,
};

const MOCK_SEARCH_RESPONSE = {
  tickets: [MOCK_TICKET],
  projects: [MOCK_PROJECT],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSearch', () => {
  it('has correct initial state: results=null, loading=false, error=null, query=""', () => {
    // Act
    const { result } = renderHook(() => useSearch());

    // Assert
    expect(result.current.results).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.query).toBe('');
  });

  it('does not fire an API call when setQuery receives a single character', async () => {
    // Arrange
    mockGetWithSignal.mockResolvedValue(MOCK_SEARCH_RESPONSE);
    const { result } = renderHook(() => useSearch());

    // Act
    act(() => {
      result.current.setQuery('a');
    });

    // Advance timers past debounce window
    await act(async () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(500);
      vi.useRealTimers();
    });

    // Assert
    expect(mockGetWithSignal).not.toHaveBeenCalled();
  });

  it('does not fire an API call when setQuery receives whitespace-only input', async () => {
    // Arrange
    mockGetWithSignal.mockResolvedValue(MOCK_SEARCH_RESPONSE);
    const { result } = renderHook(() => useSearch());

    // Act
    act(() => {
      result.current.setQuery('  ');
    });

    await act(async () => {
      vi.useFakeTimers();
      vi.advanceTimersByTime(500);
      vi.useRealTimers();
    });

    // Assert
    expect(mockGetWithSignal).not.toHaveBeenCalled();
  });

  it('fires exactly one API call after 300ms debounce when query has 6 chars', async () => {
    // Arrange
    mockGetWithSignal.mockResolvedValue(MOCK_SEARCH_RESPONSE);
    vi.useFakeTimers();

    const { result } = renderHook(() => useSearch());

    // Act
    act(() => {
      result.current.setQuery('ticket');
    });

    // Before debounce fires — no call
    expect(mockGetWithSignal).not.toHaveBeenCalled();

    // Advance past debounce window
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    vi.useRealTimers();

    // Assert — exactly one call after debounce
    expect(mockGetWithSignal).toHaveBeenCalledTimes(1);
  });

  it('fires only one API call (last query) when setQuery is called rapidly', async () => {
    // Arrange
    mockGetWithSignal.mockResolvedValue(MOCK_SEARCH_RESPONSE);
    vi.useFakeTimers();

    const { result } = renderHook(() => useSearch());

    // Act — rapid successive setQuery calls
    act(() => {
      result.current.setQuery('bu');
      result.current.setQuery('bug');
      result.current.setQuery('bug f');
      result.current.setQuery('bug fix');
    });

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    vi.useRealTimers();

    // Assert — only one API call, for the last query
    expect(mockGetWithSignal).toHaveBeenCalledTimes(1);
    const callArg: string = mockGetWithSignal.mock.calls[0][0];
    expect(callArg).toContain('bug+fix');
  });

  it('slices results to max 5 tickets and 5 projects on successful response', async () => {
    // Arrange
    const manyTickets = Array.from({ length: 10 }, (_, i) => ({ ...MOCK_TICKET, id: `t-${i}` }));
    const manyProjects = Array.from({ length: 10 }, (_, i) => ({ ...MOCK_PROJECT, id: `p-${i}` }));
    mockGetWithSignal.mockResolvedValue({ tickets: manyTickets, projects: manyProjects });
    vi.useFakeTimers();

    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('search');
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert — results are sliced to max 5 each
    expect(result.current.results!.tickets.length).toBeLessThanOrEqual(5);
    expect(result.current.results!.projects.length).toBeLessThanOrEqual(5);
  });

  it('sets error state and keeps results null on API failure', async () => {
    // Arrange
    mockGetWithSignal.mockRejectedValue(new Error('Network error'));
    vi.useFakeTimers();

    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('broken');
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Assert
    expect(result.current.error).not.toBeNull();
    expect(result.current.error!.length).toBeGreaterThan(0);
    expect(result.current.results).toBeNull();
  });

  it('clear() resets all state to initial values', async () => {
    // Arrange — set up some state first
    mockGetWithSignal.mockResolvedValue(MOCK_SEARCH_RESPONSE);
    vi.useFakeTimers();

    const { result } = renderHook(() => useSearch());

    act(() => {
      result.current.setQuery('ticket');
    });
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    vi.useRealTimers();

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act
    act(() => {
      result.current.clear();
    });

    // Assert — all state reset to initial values
    expect(result.current.query).toBe('');
    expect(result.current.results).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
