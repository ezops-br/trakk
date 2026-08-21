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

import { useComments } from './use-comments';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as ReturnType<typeof vi.fn>;
const mockDel = apiClient.del as ReturnType<typeof vi.fn>;

const PROJECT_ID = 'proj-uuid-1';
const TICKET_NUMBER = 42;
const COMMENT_ID = 'comment-uuid-1';
const OTHER_COMMENT_ID = 'comment-uuid-2';

const MOCK_AUTHOR = {
  id: 'user-uuid-1',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  avatarUrl: null,
  themePreference: 'light',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const MOCK_COMMENT = {
  id: COMMENT_ID,
  ticketId: 'ticket-uuid-1',
  authorId: 'user-uuid-1',
  body: 'This is a test comment.',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  author: MOCK_AUTHOR,
};

const MOCK_OTHER_COMMENT = {
  id: OTHER_COMMENT_ID,
  ticketId: 'ticket-uuid-1',
  authorId: 'user-uuid-2',
  body: 'Another comment.',
  createdAt: '2024-01-02T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  author: {
    id: 'user-uuid-2',
    email: 'bob@example.com',
    displayName: 'Bob Jones',
    avatarUrl: null,
    themePreference: 'light',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
};

describe('useComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state: loading=true, comments=[], error=null', () => {
    // Arrange — never resolves so we can observe initial state
    mockGet.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => useComments(PROJECT_ID, TICKET_NUMBER, true));

    // Assert — before fetch resolves
    expect(result.current.loading).toBe(true);
    expect(result.current.comments).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('successful fetch: calls GET endpoint, populates comments array, loading=false', async () => {
    // Arrange
    mockGet.mockResolvedValue({ comments: [MOCK_COMMENT, MOCK_OTHER_COMMENT] });

    // Act
    const { result } = renderHook(() => useComments(PROJECT_ID, TICKET_NUMBER, true));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.comments).toHaveLength(2);
    expect(result.current.comments[0]).toMatchObject({ id: COMMENT_ID });
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/comments`,
    );
  });

  it('enabled=false: does not fetch on mount', () => {
    // Arrange
    mockGet.mockResolvedValue({ comments: [] });

    // Act
    renderHook(() => useComments(PROJECT_ID, TICKET_NUMBER, false));

    // Assert — no fetch made
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetch error: sets error string, loading=false', async () => {
    // Arrange
    mockGet.mockRejectedValue(new Error('Network error'));

    // Act
    const { result } = renderHook(() => useComments(PROJECT_ID, TICKET_NUMBER, true));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.comments).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('createComment: calls POST, appends new comment to state', async () => {
    // Arrange
    mockGet.mockResolvedValue({ comments: [MOCK_COMMENT] });
    mockPost.mockResolvedValue({ comment: MOCK_OTHER_COMMENT });

    // Act
    const { result } = renderHook(() => useComments(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createComment('Another comment.');
    });

    // Assert
    expect(mockPost).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/comments`,
      { body: 'Another comment.' },
    );
    expect(result.current.comments).toHaveLength(2);
    expect(result.current.comments[1]).toMatchObject({ id: OTHER_COMMENT_ID });
  });

  it('updateComment: calls PATCH, replaces comment in state by id', async () => {
    // Arrange
    mockGet.mockResolvedValue({ comments: [MOCK_COMMENT, MOCK_OTHER_COMMENT] });
    const updatedComment = { ...MOCK_COMMENT, body: 'Updated body.' };
    mockPatch.mockResolvedValue({ comment: updatedComment });

    // Act
    const { result } = renderHook(() => useComments(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateComment(COMMENT_ID, 'Updated body.');
    });

    // Assert
    expect(mockPatch).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/comments/${COMMENT_ID}`,
      { body: 'Updated body.' },
    );
    const updated = result.current.comments.find((c) => c.id === COMMENT_ID);
    expect(updated?.body).toBe('Updated body.');
  });

  it('deleteComment: calls DELETE, removes comment from state by id', async () => {
    // Arrange
    mockGet.mockResolvedValue({ comments: [MOCK_COMMENT, MOCK_OTHER_COMMENT] });
    mockDel.mockResolvedValue(undefined);

    // Act
    const { result } = renderHook(() => useComments(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteComment(COMMENT_ID);
    });

    // Assert
    expect(mockDel).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/comments/${COMMENT_ID}`,
    );
    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments.find((c) => c.id === COMMENT_ID)).toBeUndefined();
  });

  it('refetch: re-fetches and replaces state', async () => {
    // Arrange — first fetch returns one comment, second fetch returns two
    mockGet
      .mockResolvedValueOnce({ comments: [MOCK_COMMENT] })
      .mockResolvedValueOnce({ comments: [MOCK_COMMENT, MOCK_OTHER_COMMENT] });

    // Act
    const { result } = renderHook(() => useComments(PROJECT_ID, TICKET_NUMBER, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.comments).toHaveLength(1);

    await act(async () => {
      await result.current.refetch();
    });

    // Assert
    await waitFor(() => expect(result.current.comments).toHaveLength(2));
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
