import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock api-client before importing the hook
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { useTheme } from '@/hooks/use-theme';
import { apiClient } from '@/lib/api-client';

const mockApiPatch = apiClient.patch as ReturnType<typeof vi.fn>;

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.clearAllMocks();
    // Default: patch resolves silently
    mockApiPatch.mockResolvedValue(undefined);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  // --- Default behaviour ---

  it('defaults to "light" when no initialTheme and localStorage is empty', () => {
    // Arrange — nothing in localStorage, no initialTheme prop

    // Act
    const { result } = renderHook(() => useTheme());

    // Assert
    expect(result.current.theme).toBe('light');
  });

  // --- initialTheme seeding ---

  it('seeds from initialTheme prop on mount — overrides empty localStorage', async () => {
    // Arrange — server says "dark", localStorage is empty
    const { result } = renderHook(() => useTheme('dark'));

    // Assert — after the mount effect runs, theme matches the server value
    await waitFor(() => expect(result.current.theme).toBe('dark'));
  });

  it('does not override existing localStorage value with initialTheme — localStorage always wins', async () => {
    // Arrange — localStorage has a stored "dark" value; server says "light"
    localStorage.setItem('trakk-theme', 'dark');

    const { result } = renderHook(() => useTheme('light'));

    // Assert — localStorage wins; user's stored preference is preserved
    await waitFor(() => expect(result.current.theme).toBe('dark'));
  });

  // --- Toggle behaviour ---

  it('toggle flips theme from "light" to "dark"', () => {
    // Arrange — start at light (default)
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    // Act
    act(() => {
      result.current.toggle();
    });

    // Assert
    expect(result.current.theme).toBe('dark');
  });

  it('toggle calls apiClient.patch with "/api/v1/auth/me" and { themePreference: "dark" }', async () => {
    // Arrange
    const { result } = renderHook(() => useTheme());

    // Act
    act(() => {
      result.current.toggle();
    });

    // Assert — patch is fired with the new theme value
    await waitFor(() =>
      expect(mockApiPatch).toHaveBeenCalledWith('/api/v1/auth/me', { themePreference: 'dark' }),
    );
  });

  it('PATCH failure does not revert theme — mock apiClient.patch to reject, theme stays toggled', async () => {
    // Arrange — patch will fail
    mockApiPatch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    // Act
    act(() => {
      result.current.toggle();
    });

    // Assert — theme is toggled optimistically and stays toggled even after the rejection settles
    await waitFor(() => expect(mockApiPatch).toHaveBeenCalled());
    expect(result.current.theme).toBe('dark');
  });

  it('sets document.documentElement data-theme attribute after toggle', async () => {
    // Arrange
    const { result } = renderHook(() => useTheme());

    // Act
    act(() => {
      result.current.toggle();
    });

    // Assert
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark'),
    );
  });

  // --- New tests for setTheme (profile feature) ---

  it('setTheme writes to localStorage and sets data-theme attribute', async () => {
    // Arrange
    const { result } = renderHook(() => useTheme());

    // Act
    act(() => {
      result.current.setTheme('dark');
    });

    // Assert
    await waitFor(() => {
      expect(result.current.theme).toBe('dark');
      expect(localStorage.getItem('trakk-theme')).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  it('setTheme fires PATCH /api/v1/auth/me with correct themePreference value', async () => {
    // Arrange
    const { result } = renderHook(() => useTheme());

    // Act
    act(() => {
      result.current.setTheme('dark');
    });

    // Assert
    await waitFor(() =>
      expect(mockApiPatch).toHaveBeenCalledWith('/api/v1/auth/me', { themePreference: 'dark' }),
    );
  });

  it('toggle delegates to setTheme internally — setTheme called with flipped value', async () => {
    // Arrange — start at light (default)
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    // Act
    act(() => {
      result.current.toggle();
    });

    // Assert — same observable effect as setTheme('dark'): theme flipped, patch fired
    await waitFor(() => {
      expect(result.current.theme).toBe('dark');
      expect(mockApiPatch).toHaveBeenCalledWith('/api/v1/auth/me', { themePreference: 'dark' });
    });
  });
});
