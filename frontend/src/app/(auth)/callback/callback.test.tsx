import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApiError } from '@/lib/api-client';

// Mock next/navigation
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  })),
}));

// Mock the api-client
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

import CallbackPage from './page';
import { apiClient } from '@/lib/api-client';

const mockApiGet = apiClient.get as ReturnType<typeof vi.fn>;

describe('CallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
  });

  it('renders a loading spinner on mount', () => {
    // Arrange — delay so the component stays in loading state during the assertion
    mockApiGet.mockReturnValue(new Promise(() => {}));

    // Act
    render(<CallbackPage />);

    // Assert — should show some kind of loading indicator
    // Accept any of: spinner role, progressbar, text, or a loading aria label
    const hasLoadingIndicator =
      screen.queryByRole('progressbar') !== null ||
      screen.queryByLabelText(/loading/i) !== null ||
      screen.queryByText(/loading|redirecting|please wait/i) !== null ||
      document.querySelector('[data-testid="loading"]') !== null ||
      document.querySelector('[aria-busy="true"]') !== null;

    expect(hasLoadingIndicator).toBe(true);
  });

  it('navigates to /dashboard when GET /api/v1/auth/me succeeds', async () => {
    // Arrange
    const mockUser = {
      id: 'user-1',
      email: 'alice@example.com',
      displayName: 'Alice',
      avatarUrl: null,
    };
    mockApiGet.mockResolvedValue(mockUser);

    // Act
    render(<CallbackPage />);

    // Assert
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('navigates to /login?error=auth_failed when GET /api/v1/auth/me returns 401', async () => {
    // Arrange
    mockApiGet.mockRejectedValue(new ApiError(401, 'Unauthorized'));

    // Act
    render(<CallbackPage />);

    // Assert
    await waitFor(() => {
      const pushedOrReplaced =
        mockRouterPush.mock.calls.some((call: string[]) => call[0]?.includes('/login')) ||
        mockRouterReplace.mock.calls.some((call: string[]) => call[0]?.includes('/login'));
      expect(pushedOrReplaced).toBe(true);
    });

    const allCalls = [
      ...mockRouterPush.mock.calls.map((call: string[]) => call[0]),
      ...mockRouterReplace.mock.calls.map((call: string[]) => call[0]),
    ];
    expect(allCalls.some((url: string) => url?.includes('error=auth_failed'))).toBe(true);
  });
});
