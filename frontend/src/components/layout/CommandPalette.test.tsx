import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// CommandPalette.tsx does not exist yet — tests fail with "Cannot find module".

// Mock the context hook so we can control isOpen without a real provider
vi.mock('@/components/layout/CommandPaletteProvider', () => ({
  useCommandPalette: vi.fn(() => ({
    isOpen: true,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  })),
}));

// Mock use-search so we can control search state
vi.mock('@/hooks/use-search', () => ({
  useSearch: vi.fn(() => ({
    query: '',
    setQuery: vi.fn(),
    clear: vi.fn(),
    results: null,
    loading: false,
    error: null,
  })),
}));

import { CommandPalette } from '@/components/layout/CommandPalette';
import * as useSearchModule from '@/hooks/use-search';
import * as commandPaletteModule from '@/components/layout/CommandPaletteProvider';

const mockUseSearch = useSearchModule.useSearch as ReturnType<typeof vi.fn>;
const mockUseCommandPalette = commandPaletteModule.useCommandPalette as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply default implementations after clearAllMocks
  mockUseCommandPalette.mockReturnValue({
    isOpen: true,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
  });
  mockUseSearch.mockReturnValue({
    query: '',
    setQuery: vi.fn(),
    clear: vi.fn(),
    results: null,
    loading: false,
    error: null,
  });
});

describe('CommandPalette', () => {
  it('renders ACTIONS group with expected quick-action items when idle (empty query, no results)', () => {
    // Arrange — isOpen=true, query='', results=null, loading=false
    render(<CommandPalette />);

    // Assert — all default actions are present
    expect(screen.getByText('Create Ticket')).toBeInTheDocument();
    expect(screen.getByText('New Project')).toBeInTheDocument();
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Profile & Settings')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('still renders the ACTIONS group in the DOM when loading=true', () => {
    // Arrange — loading=true
    mockUseSearch.mockReturnValue({
      query: 'ticket',
      setQuery: vi.fn(),
      clear: vi.fn(),
      results: null,
      loading: true,
      error: null,
    });
    render(<CommandPalette />);

    // Assert — ACTIONS group persists while loading
    expect(screen.getByText('Create Ticket')).toBeInTheDocument();
  });

  it('renders "No results found." message and keeps ACTIONS group when query is long enough but results are empty', () => {
    // Arrange — query >= 2 chars, not loading, no error, empty results
    mockUseSearch.mockReturnValue({
      query: 'xyzzy',
      setQuery: vi.fn(),
      clear: vi.fn(),
      results: { tickets: [], projects: [] },
      loading: false,
      error: null,
    });
    render(<CommandPalette />);

    // Assert
    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    // ACTIONS group still present alongside the "no results" message
    expect(screen.getByText('Create Ticket')).toBeInTheDocument();
  });
});
