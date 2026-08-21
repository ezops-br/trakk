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

import { useTickets } from '@/hooks/use-tickets';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as ReturnType<typeof vi.fn>;

const PROJECT_ID = 'proj-uuid-1';

const MOCK_TICKET = {
  id: 'ticket-uuid-1',
  projectId: PROJECT_ID,
  number: 1,
  title: 'First ticket',
  description: null,
  statusColumnId: 'col-1',
  priority: 'MEDIUM' as const,
  assigneeId: null,
  reporterId: 'user-uuid-1',
  sortOrder: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  assignee: null,
  reporter: { id: 'user-uuid-1', email: 'a@b.c', displayName: 'A' },
  statusColumn: { id: 'col-1', name: 'To Do', position: 0 },
  labels: [],
};

const MOCK_TICKET_2 = { ...MOCK_TICKET, id: 'ticket-uuid-2', number: 2, sortOrder: 2 };

describe('useTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches on mount and unwraps the { tickets, total, page, pageSize } envelope', async () => {
    // Arrange
    mockGet.mockResolvedValue({
      tickets: [MOCK_TICKET, MOCK_TICKET_2],
      total: 2,
      page: 1,
      pageSize: 50,
    });

    // Act
    const { result } = renderHook(() => useTickets(PROJECT_ID));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tickets).toHaveLength(2);
    expect(result.current.total).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('createTicket returns a ticket with assignee, reporter, labels, and statusColumn relations', async () => {
    // Arrange
    mockGet.mockResolvedValue({ tickets: [], total: 0, page: 1, pageSize: 50 });
    mockPost.mockResolvedValue({ ticket: MOCK_TICKET });

    // Act
    const { result } = renderHook(() => useTickets(PROJECT_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: any;
    await act(async () => {
      created = await result.current.createTicket({
        title: 'First ticket',
        statusColumnId: 'col-1',
        priority: 'MEDIUM',
      });
    });

    // Assert — relations must be present on the returned object
    expect(created).toHaveProperty('reporter');
    expect(created).toHaveProperty('statusColumn');
    expect(created).toHaveProperty('labels');
    expect(created).toHaveProperty('assignee');
    expect(result.current.tickets).toHaveLength(1);
  });

  it('reorderTickets optimistically updates state before the request resolves', async () => {
    // Arrange
    mockGet.mockResolvedValue({
      tickets: [MOCK_TICKET, MOCK_TICKET_2],
      total: 2,
      page: 1,
      pageSize: 50,
    });
    // Never resolve so we can observe the optimistic state mid-flight.
    mockPatch.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => useTickets(PROJECT_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      void result.current.reorderTickets([
        { ticketId: 'ticket-uuid-2', sortOrder: 0, statusColumnId: 'col-1' },
      ]);
    });

    // Assert — the moved ticket's sortOrder updated immediately, no await on PATCH
    await waitFor(() => {
      const moved = result.current.tickets.find((t) => t.id === 'ticket-uuid-2');
      expect(moved?.sortOrder).toBe(0);
    });
  });

  it('archiveTicket PATCHes .../archive with { archive: true } and drops the ticket from state', async () => {
    // Arrange
    mockGet.mockResolvedValue({
      tickets: [MOCK_TICKET, MOCK_TICKET_2],
      total: 2,
      page: 1,
      pageSize: 50,
    });
    mockPatch.mockResolvedValue({ ticket: { ...MOCK_TICKET_2, archivedAt: '2026-08-21T10:00:00.000Z' } });

    // Act
    const { result } = renderHook(() => useTickets(PROJECT_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.archiveTicket(2);
    });

    // Assert — soft delete: PATCH the archive endpoint, never DELETE the ticket.
    expect(mockPatch).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/2/archive`,
      { archive: true },
    );
    expect(apiClient.del).not.toHaveBeenCalled();
    expect(result.current.tickets.map((t) => t.number)).toEqual([1]);
    expect(result.current.total).toBe(1);
  });

  it('reorderTickets reverts to the original order when the request fails', async () => {
    // Arrange
    mockGet.mockResolvedValue({
      tickets: [MOCK_TICKET, MOCK_TICKET_2],
      total: 2,
      page: 1,
      pageSize: 50,
    });
    mockPatch.mockRejectedValue(new Error('Server error'));

    // Act
    const { result } = renderHook(() => useTickets(PROJECT_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current
        .reorderTickets([{ ticketId: 'ticket-uuid-2', sortOrder: 0, statusColumnId: 'col-1' }])
        .catch(() => {});
    });

    // Assert — sortOrder reverted to the original value after the failure
    const reverted = result.current.tickets.find((t) => t.id === 'ticket-uuid-2');
    expect(reverted?.sortOrder).toBe(2);
  });
});
