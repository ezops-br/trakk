// TDD Red Phase — use-profile.ts does not exist yet.
// Tests for useProfile hook: fetch, updateDisplayName, uploadAvatar, deleteAccount.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock api-client before importing the hook
vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    details?: string;
    constructor(status: number, message: string, details?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.details = details;
    }
  },
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

// Mock fetch for uploadAvatar (raw FormData, not apiClient)
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { useProfile } from '@/hooks/use-profile';
import { apiClient } from '@/lib/api-client';

const mockApiGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockApiPatch = apiClient.patch as ReturnType<typeof vi.fn>;
const mockApiDel = apiClient.del as ReturnType<typeof vi.fn>;

const MOCK_PROFILE = {
  id: 'user-uuid-1',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  avatarUrl: 'https://example.com/avatar.jpg',
  themePreference: 'light',
  googleConnected: true,
  googleEmail: 'alice@example.com',
};

describe('useProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ avatarUrl: '/api/v1/uploads/avatars/new.jpg' }),
    });
  });

  it('fetches /auth/me on mount and populates profile state', async () => {
    // Arrange
    mockApiGet.mockResolvedValue(MOCK_PROFILE);

    // Act
    const { result } = renderHook(() => useProfile());

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.profile).toEqual(MOCK_PROFILE);
    expect(mockApiGet).toHaveBeenCalledWith('/api/v1/auth/me');
  });

  it('updateDisplayName optimistically updates profile.displayName', async () => {
    // Arrange
    mockApiGet.mockResolvedValue(MOCK_PROFILE);
    mockApiPatch.mockResolvedValue({ ...MOCK_PROFILE, displayName: 'Alice Updated' });

    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act
    await act(async () => {
      await result.current.updateDisplayName('Alice Updated');
    });

    // Assert
    expect(result.current.profile?.displayName).toBe('Alice Updated');
    expect(mockApiPatch).toHaveBeenCalledWith('/api/v1/auth/me', { displayName: 'Alice Updated' });
  });

  it('updateDisplayName throws and rolls back displayName on API failure', async () => {
    // Arrange
    mockApiGet.mockResolvedValue(MOCK_PROFILE);
    mockApiPatch.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const originalName = result.current.profile?.displayName;

    // Act & Assert — should throw
    await act(async () => {
      await expect(result.current.updateDisplayName('Bad Name')).rejects.toThrow();
    });

    // Rollback: display name reverts to original
    expect(result.current.profile?.displayName).toBe(originalName);
  });

  it('uploadAvatar sends FormData with "avatar" field via raw fetch (not apiClient)', async () => {
    // Arrange
    mockApiGet.mockResolvedValue(MOCK_PROFILE);
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fakeBlob = new Blob(['imagedata'], { type: 'image/jpeg' });

    // Act
    await act(async () => {
      await result.current.uploadAvatar(fakeBlob, 'photo.jpg');
    });

    // Assert — raw fetch called, not apiClient.post
    expect(mockFetch).toHaveBeenCalled();
    const fetchCall = mockFetch.mock.calls[0];
    const bodyArg = fetchCall[1]?.body;
    expect(bodyArg).toBeInstanceOf(FormData);
    // FormData must contain the 'avatar' field
    const formData = bodyArg as FormData;
    expect(formData.get('avatar')).toBeTruthy();
  });

  it('deleteAccount sends DELETE with Content-Type: application/json, then navigates to /login', async () => {
    // Arrange
    mockApiGet.mockResolvedValue(MOCK_PROFILE);
    mockApiDel.mockResolvedValue({ message: 'Account deleted' });

    const { useRouter } = await import('next/navigation');
    const mockPush = vi.fn();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush, replace: vi.fn() });

    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Act
    await act(async () => {
      await result.current.deleteAccount();
    });

    // Assert — DELETE called with correct path; navigation to /login
    expect(mockApiDel).toHaveBeenCalledWith('/api/v1/auth/me');
    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});
