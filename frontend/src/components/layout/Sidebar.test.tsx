import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProjectWithRole } from '@/lib/types';

// Mock dependencies before importing the component
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ projects: [] }),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { Sidebar } from '@/components/layout/Sidebar';
import { apiClient } from '@/lib/api-client';
import { usePathname, useRouter } from 'next/navigation';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockUsePathname = usePathname as ReturnType<typeof vi.fn>;
const mockUseRouter = useRouter as ReturnType<typeof vi.fn>;

// Mocks apiClient.get to respond with an active projects list, mirroring the
// real backend contract: /api/v1/projects.
function setupMockGet(activeProjects: ProjectWithRole[] = []) {
  mockGet.mockImplementation(() => Promise.resolve({ projects: activeProjects }));
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUsePathname.mockReturnValue('/');
    mockUseRouter.mockReturnValue({ push: vi.fn() });
    setupMockGet([]);
  });

  it('renders compact Plus button with aria-label="New project" in Projects heading row', async () => {
    // Arrange & Act
    render(<Sidebar />);

    // Assert — the compact icon-only button in the Projects heading must exist
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument();
    });
  });

  it('does NOT render a link to /projects with text "New" (regression guard)', async () => {
    // Arrange & Act
    render(<Sidebar />);

    // Assert — the full-width "New" link at lines 132-138 should be removed
    // This test will FAIL until the builder removes that Link element.
    await waitFor(() => {
      const newLinks = screen
        .queryAllByRole('link')
        .filter(
          (el) =>
            el.getAttribute('href') === '/projects' &&
            el.textContent?.trim() === 'New',
        );
      expect(newLinks).toHaveLength(0);
    });
  });

  it('clicking compact Plus button dispatches "open-create-project-dialog" window event', async () => {
    // Arrange — must be on /projects so the handler dispatches instead of navigating
    mockUsePathname.mockReturnValue('/projects');
    const dispatchedEvents: string[] = [];
    const listener = (e: Event) => dispatchedEvents.push(e.type);
    window.addEventListener('open-create-project-dialog', listener);

    render(<Sidebar />);

    const newProjectButton = await screen.findByRole('button', { name: 'New project' });

    // Act
    fireEvent.click(newProjectButton);

    // Assert
    expect(dispatchedEvents).toContain('open-create-project-dialog');

    window.removeEventListener('open-create-project-dialog', listener);
  });

  // ─── Archived section removal regression guards ─────────────────────────
  // These assert the "Archived" sidebar section is fully gone. They must FAIL
  // right now — the section still renders and the sidebar still calls the
  // /api/v1/projects/archived endpoint — until the builder removes it.

  it('does not render an "Archived" section, heading, toggle, or empty-state text, for any role', async () => {
    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.queryByText('Archived')).toBeNull();
      expect(screen.queryByText('No archived projects')).toBeNull();
      expect(screen.queryByRole('button', { name: /archived/i })).toBeNull();
    });
  });

  it('fetches only /api/v1/projects on mount and on "project-list-changed", never /api/v1/projects/archived', async () => {
    render(<Sidebar />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/projects');
    });

    mockGet.mockClear();

    window.dispatchEvent(new Event('project-list-changed'));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/projects');
    });

    expect(mockGet).not.toHaveBeenCalledWith('/api/v1/projects/archived');
  });

  it('renders normally with no errors when localStorage["trakk-sidebar-archived-open"] is already set to "true" from a prior session', async () => {
    localStorage.setItem('trakk-sidebar-archived-open', 'true');

    expect(() => render(<Sidebar />)).not.toThrow();

    await waitFor(() => {
      expect(screen.queryByText('Archived')).toBeNull();
      expect(screen.queryByText('No archived projects')).toBeNull();
    });
  });
});
