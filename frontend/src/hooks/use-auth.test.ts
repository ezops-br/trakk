import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api-client';
import type { User } from '@/lib/types';

// Mock the api-client module before importing the hook
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

import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';

const mockApiGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockApiPost = apiClient.post as ReturnType<typeof vi.fn>;

const MOCK_USER: User = {
  id: 'user-uuid-1',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  avatarUrl: 'https://example.com/avatar.jpg',
  themePreference: 'light',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with loading=true and user=null', () => {
    // Arrange — delay the response so we can check the initial state
    mockApiGet.mockReturnValue(new Promise(() => {}));

    // Act
    const { result } = renderHook(() => useAuth());

    // Assert — initial state before the fetch resolves
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it('sets user to the fetched User object on a successful /auth/me call', async () => {
    // Arrange
    mockApiGet.mockResolvedValue(MOCK_USER);

    // Act
    const { result } = renderHook(() => useAuth());

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(MOCK_USER);
    expect(result.current.error).toBeNull();
  });

  it('sets user=null with no error string on a 401 response from /auth/me', async () => {
    // Arrange
    mockApiGet.mockRejectedValue(new ApiError(401, 'Unauthorized'));

    // Act
    const { result } = renderHook(() => useAuth());

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets error to the error message on a non-401 API failure', async () => {
    // Arrange
    mockApiGet.mockRejectedValue(new ApiError(500, 'Internal server error'));

    // Act
    const { result } = renderHook(() => useAuth());

    // Assert
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBe('Internal server error');
  });

  it('logout calls POST /api/v1/auth/logout and navigates to /login', async () => {
    // Arrange
    mockApiGet.mockResolvedValue(MOCK_USER);
    mockApiPost.mockResolvedValue(undefined);
    const { useRouter } = await import('next/navigation');
    const mockPush = vi.fn();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush, replace: vi.fn() });

    // Act
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    // Assert
    expect(mockApiPost).toHaveBeenCalledWith('/api/v1/auth/logout');
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('refetch re-calls /api/v1/auth/me and updates the user state', async () => {
    // Arrange — first call returns original user
    const updatedUser = { ...MOCK_USER, displayName: 'Alice Updated' };
    mockApiGet
      .mockResolvedValueOnce(MOCK_USER)
      .mockResolvedValueOnce(updatedUser);

    // Act
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.displayName).toBe('Alice Smith');

    await act(async () => {
      await result.current.refetch();
    });

    // Assert
    expect(result.current.user?.displayName).toBe('Alice Updated');
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });
});
