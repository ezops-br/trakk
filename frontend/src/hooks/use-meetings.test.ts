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

import { useMeetings } from './use-meetings';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;
const mockDel = apiClient.del as ReturnType<typeof vi.fn>;

const PROJECT_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';
const TICKET_NUMBER = 5;
const MEETING_ID_1 = 'b1c2d3e4-f5a6-789b-cdef-012345678901';
const MEETING_ID_2 = 'c2d3e4f5-a6b7-890c-def0-123456789012';
const CURSOR_1 = 'cursor-uuid-page-2';

const MOCK_MEETING_1 = {
  id: MEETING_ID_1,
  ticketId: 'ticket-uuid-1',
  organizerId: 'user-uuid-1',
  googleEventId: 'google-event-1',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  title: 'Planning session',
  startTime: '2026-06-12T14:00:00.000Z',
  endTime: '2026-06-12T15:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const MOCK_MEETING_2 = {
  ...MOCK_MEETING_1,
  id: MEETING_ID_2,
  title: 'Retrospective',
};

describe('useMeetings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state: meetings=[], loading=true, nextCursor=null, error=null', () => {
    // Arrange — never resolves so we can observe initial state
    mockGet.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => useMeetings(PROJECT_ID, TICKET_NUMBER, true));

    // Assert — before fetch resolves
    expect(result.current.loading).toBe(true);
    expect(result.current.meetings).toEqual([]);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('successful fetch: populates meetings, loading=false, nextCursor set from response', async () => {
    // Arrange
    mockGet.mockResolvedValue({
      meetings: [MOCK_MEETING_1, MOCK_MEETING_2],
      nextCursor: CURSOR_1,
    });

    // Act
    const { result } = renderHook(() => useMeetings(PROJECT_ID, TICKET_NUMBER, true));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meetings).toHaveLength(2);
    expect(result.current.meetings[0]).toMatchObject({ id: MEETING_ID_1 });
    expect(result.current.nextCursor).toBe(CURSOR_1);
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/meetings`,
    );
  });

  it('fetch error: error set, loading=false, meetings remains empty', async () => {
    // Arrange
    mockGet.mockRejectedValue(new Error('Network error'));

    // Act
    const { result } = renderHook(() => useMeetings(PROJECT_ID, TICKET_NUMBER, true));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meetings).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('scheduleMeeting adds meeting to local state on success', async () => {
    // Arrange
    mockGet.mockResolvedValue({ meetings: [MOCK_MEETING_1], nextCursor: null });
    mockPost.mockResolvedValue({ meeting: MOCK_MEETING_2 });

    // Act
    const { result } = renderHook(() => useMeetings(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.scheduleMeeting({
        title: 'Retrospective',
        startTime: '2026-06-12T14:00:00.000Z',
        endTime: '2026-06-12T15:00:00.000Z',
      });
    });

    // Assert
    expect(mockPost).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/meetings`,
      expect.objectContaining({ title: 'Retrospective' }),
    );
    expect(result.current.meetings).toHaveLength(2);
    expect(result.current.meetings[1]).toMatchObject({ id: MEETING_ID_2 });
  });

  it('cancelMeeting removes meeting from local state by id', async () => {
    // Arrange
    mockGet.mockResolvedValue({ meetings: [MOCK_MEETING_1, MOCK_MEETING_2], nextCursor: null });
    mockDel.mockResolvedValue({ message: 'Meeting cancelled' });

    // Act
    const { result } = renderHook(() => useMeetings(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.cancelMeeting(MEETING_ID_1);
    });

    // Assert
    expect(mockDel).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/meetings/${MEETING_ID_1}`,
    );
    expect(result.current.meetings).toHaveLength(1);
    expect(result.current.meetings.find((m) => m.id === MEETING_ID_1)).toBeUndefined();
  });

  it('fetchNextPage appends to existing meetings and updates nextCursor', async () => {
    // Arrange — first fetch returns page 1, fetchNextPage returns page 2
    mockGet
      .mockResolvedValueOnce({ meetings: [MOCK_MEETING_1], nextCursor: CURSOR_1 })
      .mockResolvedValueOnce({ meetings: [MOCK_MEETING_2], nextCursor: null });

    // Act
    const { result } = renderHook(() => useMeetings(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meetings).toHaveLength(1);
    expect(result.current.nextCursor).toBe(CURSOR_1);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    // Assert — meetings appended, cursor updated
    await waitFor(() => expect(result.current.meetings).toHaveLength(2));
    expect(result.current.meetings[0]).toMatchObject({ id: MEETING_ID_1 });
    expect(result.current.meetings[1]).toMatchObject({ id: MEETING_ID_2 });
    expect(result.current.nextCursor).toBeNull();
  });
});
