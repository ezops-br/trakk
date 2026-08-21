import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as useThemeModule from '@/hooks/use-theme';

// Mock use-theme before importing the component
const mockToggle = vi.fn();
const mockSetTheme = vi.fn();
let mockTheme: 'light' | 'dark' = 'light';

vi.mock('@/hooks/use-theme', () => ({
  useTheme: vi.fn(() => ({ theme: mockTheme, toggle: mockToggle, setTheme: mockSetTheme })),
}));

import { ThemeToggle } from '@/components/layout/ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToggle.mockReset();
    // Reset the mock implementation after clearAllMocks
    vi.mocked(useThemeModule.useTheme).mockImplementation(() => ({
      theme: mockTheme,
      toggle: mockToggle,
      setTheme: mockSetTheme,
    }));
  });

  it('renders Moon icon when theme is "light"', () => {
    // Arrange
    mockTheme = 'light';
    vi.mocked(useThemeModule.useTheme).mockReturnValue({ theme: 'light', toggle: mockToggle, setTheme: mockSetTheme });

    // Act
    render(<ThemeToggle />);

    // Assert — Moon icon should be present (aria-label indicates switching to dark)
    expect(screen.getByRole('button')).toBeInTheDocument();
    // The Moon icon is rendered when theme is light (to indicate "switch to dark")
    expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
  });

  it('renders Sun icon when theme is "dark"', () => {
    // Arrange
    vi.mocked(useThemeModule.useTheme).mockReturnValue({ theme: 'dark', toggle: mockToggle, setTheme: mockSetTheme });

    // Act
    render(<ThemeToggle />);

    // Assert — Sun icon should be present (aria-label indicates switching to light)
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
  });

  it('calls toggle once on button click', () => {
    // Arrange
    vi.mocked(useThemeModule.useTheme).mockReturnValue({ theme: 'light', toggle: mockToggle, setTheme: mockSetTheme });
    render(<ThemeToggle />);

    // Act
    fireEvent.click(screen.getByRole('button'));

    // Assert
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it('aria-label is "Switch to dark mode" when theme is "light"', () => {
    // Arrange
    vi.mocked(useThemeModule.useTheme).mockReturnValue({ theme: 'light', toggle: mockToggle, setTheme: mockSetTheme });

    // Act
    render(<ThemeToggle />);

    // Assert
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });

  it('aria-label is "Switch to light mode" when theme is "dark"', () => {
    // Arrange
    vi.mocked(useThemeModule.useTheme).mockReturnValue({ theme: 'dark', toggle: mockToggle, setTheme: mockSetTheme });

    // Act
    render(<ThemeToggle />);

    // Assert
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });
});
