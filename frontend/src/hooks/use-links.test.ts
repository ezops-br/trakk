import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock api-client before importing the hook
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
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { useLinks } from './use-links';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;
const mockDel = apiClient.del as ReturnType<typeof vi.fn>;

const PROJECT_ID = 'proj-uuid-1';
const TICKET_NUMBER = 42;
const LINK_ID = 'link-uuid-1';

const MOCK_LINK = {
  id: LINK_ID,
  sourceTicketId: 'ticket-uuid-1',
  targetTicketId: 'ticket-uuid-2',
  type: 'BLOCKS',
  direction: 'outgoing',
  createdAt: '2024-01-01T00:00:00.000Z',
  createdById: 'user-uuid-1',
  targetNumber: 7,
  targetTitle: 'Other ticket',
  targetProjectId: PROJECT_ID,
  targetProjectKey: 'TRAKK',
  targetPriority: 'HIGH',
  targetStatusColumnName: 'In Progress',
  displayType: 'Blocks',
};

describe('useLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state: loading=true, links=[], error=null', () => {
    // Arrange — never resolves so we can observe initial state
    mockGet.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => useLinks(PROJECT_ID, TICKET_NUMBER, true));

    // Assert — before fetch resolves
    expect(result.current.loading).toBe(true);
    expect(result.current.links).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('successful fetch: calls GET endpoint, populates links array, loading=false', async () => {
    // Arrange
    mockGet.mockResolvedValue({ links: [MOCK_LINK] });

    // Act
    const { result } = renderHook(() => useLinks(PROJECT_ID, TICKET_NUMBER, true));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.links).toHaveLength(1);
    expect(result.current.links[0]).toMatchObject({ id: LINK_ID });
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/links`,
    );
  });

  it('enabled=false: does not fetch on mount', () => {
    // Arrange
    mockGet.mockResolvedValue({ links: [] });

    // Act
    renderHook(() => useLinks(PROJECT_ID, TICKET_NUMBER, false));

    // Assert — no fetch made
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetch error: sets error string, loading=false', async () => {
    // Arrange
    mockGet.mockRejectedValue(new Error('Network error'));

    // Act
    const { result } = renderHook(() => useLinks(PROJECT_ID, TICKET_NUMBER, true));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.links).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('createLink: calls POST and refetches', async () => {
    // Arrange
    mockGet.mockResolvedValue({ links: [] });
    mockPost.mockResolvedValue({ link: MOCK_LINK });

    // Act
    const { result } = renderHook(() => useLinks(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createLink({ targetTicketNumber: 7, type: 'BLOCKS' });
    });

    // Assert
    expect(mockPost).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/links`,
      { targetTicketNumber: 7, type: 'BLOCKS' },
    );
    // initial fetch + refetch after create
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('deleteLink: calls DELETE and refetches', async () => {
    // Arrange
    mockGet.mockResolvedValue({ links: [MOCK_LINK] });
    mockDel.mockResolvedValue(undefined);

    // Act
    const { result } = renderHook(() => useLinks(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteLink(LINK_ID);
    });

    // Assert
    expect(mockDel).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/links/${LINK_ID}`,
    );
    // initial fetch + refetch after delete
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('refetch: re-runs the GET', async () => {
    // Arrange — first fetch returns one link, second returns two
    const secondLink = { ...MOCK_LINK, id: 'link-uuid-2' };
    mockGet
      .mockResolvedValueOnce({ links: [MOCK_LINK] })
      .mockResolvedValueOnce({ links: [MOCK_LINK, secondLink] });

    // Act
    const { result } = renderHook(() => useLinks(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.links).toHaveLength(1);

    await act(async () => {
      await result.current.refetch();
    });

    // Assert
    await waitFor(() => expect(result.current.links).toHaveLength(2));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
