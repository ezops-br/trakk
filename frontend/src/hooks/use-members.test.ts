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

import { useMembers } from '@/hooks/use-members';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as ReturnType<typeof vi.fn>;
const mockDel = apiClient.del as ReturnType<typeof vi.fn>;

const PROJECT_ID = 'proj-uuid-1';
const MEMBER_ID = 'member-uuid-1';
const OTHER_MEMBER_ID = 'member-uuid-2';

const MOCK_MEMBER = {
  id: MEMBER_ID,
  projectId: PROJECT_ID,
  userId: 'user-uuid-1',
  role: 'OWNER' as const,
  joinedAt: '2024-01-01T00:00:00.000Z',
  user: {
    id: 'user-uuid-1',
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    avatarUrl: null,
    themePreference: 'light',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
};

const MOCK_OTHER_MEMBER = {
  id: OTHER_MEMBER_ID,
  projectId: PROJECT_ID,
  userId: 'user-uuid-2',
  role: 'MEMBER' as const,
  joinedAt: '2024-01-01T00:00:00.000Z',
  user: {
    id: 'user-uuid-2',
    email: 'bob@example.com',
    displayName: 'Bob Jones',
    avatarUrl: null,
    themePreference: 'light',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
};

describe('useMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches on mount and unwraps { members } envelope into state', async () => {
    // Arrange
    mockGet.mockResolvedValue({ members: [MOCK_MEMBER, MOCK_OTHER_MEMBER] });

    // Act
    const { result } = renderHook(() => useMembers(PROJECT_ID));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.members).toHaveLength(2);
    expect(result.current.members[0]).toMatchObject({ id: MEMBER_ID, role: 'OWNER' });
    expect(result.current.error).toBeNull();
    expect(mockGet).toHaveBeenCalledWith(`/api/v1/projects/${PROJECT_ID}/members`);
  });

  it('sets error state when fetch fails and leaves members empty', async () => {
    // Arrange
    mockGet.mockRejectedValue(new Error('Network error'));

    // Act
    const { result } = renderHook(() => useMembers(PROJECT_ID));

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.members).toEqual([]);
    expect(result.current.error).toBe('Network error');
  });

  it('inviteMember calls POST with correct args and appends the new member to state', async () => {
    // Arrange
    mockGet.mockResolvedValue({ members: [MOCK_MEMBER] });
    mockPost.mockResolvedValue({ member: MOCK_OTHER_MEMBER });

    // Act
    const { result } = renderHook(() => useMembers(PROJECT_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.inviteMember('bob@example.com', 'MEMBER');
    });

    // Assert
    expect(mockPost).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/members`,
      { email: 'bob@example.com', role: 'MEMBER' },
    );
    expect(result.current.members).toHaveLength(2);
    expect(result.current.members[1]).toMatchObject({ id: OTHER_MEMBER_ID });
  });

  it('changeMemberRole calls PATCH with correct args and updates the member in state', async () => {
    // Arrange
    mockGet.mockResolvedValue({ members: [MOCK_MEMBER, MOCK_OTHER_MEMBER] });
    const updatedMember = { ...MOCK_OTHER_MEMBER, role: 'VIEWER' as const };
    mockPatch.mockResolvedValue({ member: updatedMember });

    // Act
    const { result } = renderHook(() => useMembers(PROJECT_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.changeMemberRole(OTHER_MEMBER_ID, 'VIEWER');
    });

    // Assert
    expect(mockPatch).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/members/${OTHER_MEMBER_ID}`,
      { role: 'VIEWER' },
    );
    const changed = result.current.members.find((m) => m.id === OTHER_MEMBER_ID);
    expect(changed?.role).toBe('VIEWER');
  });

  it('removeMember calls DELETE with correct args and removes the member from state', async () => {
    // Arrange
    mockGet.mockResolvedValue({ members: [MOCK_MEMBER, MOCK_OTHER_MEMBER] });
    mockDel.mockResolvedValue(undefined);

    // Act
    const { result } = renderHook(() => useMembers(PROJECT_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeMember(OTHER_MEMBER_ID);
    });

    // Assert
    expect(mockDel).toHaveBeenCalledWith(
      `/api/v1/projects/${PROJECT_ID}/members/${OTHER_MEMBER_ID}`,
    );
    expect(result.current.members).toHaveLength(1);
    expect(result.current.members.find((m) => m.id === OTHER_MEMBER_ID)).toBeUndefined();
  });
});
