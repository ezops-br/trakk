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

import { useTicketDetail } from '@/hooks/use-ticket-detail';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockDel = apiClient.del as ReturnType<typeof vi.fn>;

const PROJECT_ID = 'proj-uuid-1';
const TICKET_NUMBER = 42;

const MOCK_TICKET_DETAIL = {
  id: 'ticket-uuid-1',
  projectId: PROJECT_ID,
  number: TICKET_NUMBER,
  title: 'Fix login bug',
  description: null,
  statusColumnId: 'col-1',
  priority: 'HIGH' as const,
  assigneeId: null,
  reporterId: 'user-uuid-1',
  sortOrder: 1000,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  assignee: null,
  reporter: { id: 'user-uuid-1', displayName: 'Alice', avatarUrl: null },
  statusColumn: { id: 'col-1', name: 'To Do', position: 0 },
  labels: [],
  activityLog: [],
};

describe('useTicketDetail — deleteTicketPermanently', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ ticket: MOCK_TICKET_DETAIL });
  });

  it('calls DELETE on the existing ticket endpoint (no archive flag) and resolves', async () => {
    // Arrange
    mockDel.mockResolvedValue(undefined);

    // Act
    const { result } = renderHook(() =>
      useTicketDetail(PROJECT_ID, TICKET_NUMBER),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteTicketPermanently();
    });

    // Assert — hard delete hits the unchanged DELETE endpoint.
    expect(mockDel).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}`,
    );
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('rejects when the DELETE request fails so the caller can surface the error', async () => {
    // Arrange
    mockDel.mockRejectedValue(new Error('Forbidden'));

    // Act
    const { result } = renderHook(() =>
      useTicketDetail(PROJECT_ID, TICKET_NUMBER),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let caught: unknown;
    await act(async () => {
      caught = await result.current.deleteTicketPermanently().catch((e: unknown) => e);
    });

    // Assert — the rejection must propagate so the dialog can show the error.
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('Forbidden');
  });
});
