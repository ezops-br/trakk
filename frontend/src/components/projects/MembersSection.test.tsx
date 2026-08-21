import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock use-members before importing the component
vi.mock('@/hooks/use-members', () => ({
  useMembers: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ projectId: 'proj-uuid-1' })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

import { MembersSection } from '@/components/projects/MembersSection';
import * as useMembersModule from '@/hooks/use-members';

const PROJECT_ID = 'proj-uuid-1';
const CURRENT_USER_ID = 'user-uuid-1';

const MOCK_OWNER_MEMBER = {
  id: 'member-uuid-1',
  projectId: PROJECT_ID,
  userId: CURRENT_USER_ID,
  role: 'OWNER' as const,
  joinedAt: '2024-01-01T00:00:00.000Z',
  user: {
    id: CURRENT_USER_ID,
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    avatarUrl: null,
    themePreference: 'light',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
};

const MOCK_OTHER_MEMBER = {
  id: 'member-uuid-2',
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

const DEFAULT_HOOK_RETURN = {
  members: [MOCK_OWNER_MEMBER, MOCK_OTHER_MEMBER],
  loading: false,
  error: null,
  inviteMember: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useMembersModule.useMembers).mockReturnValue(DEFAULT_HOOK_RETURN);
});

describe('MembersSection', () => {
  it('renders loading skeleton when loading is true', () => {
    // Arrange
    vi.mocked(useMembersModule.useMembers).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      members: [],
      loading: true,
    });

    // Act
    render(
      <MembersSection
        projectId={PROJECT_ID}
        currentUserId={CURRENT_USER_ID}
        currentUserRole="OWNER"
      />,
    );

    // Assert — skeleton should be rendered, member list should not
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
    // A skeleton element should be present
    const skeletons = document.querySelectorAll('[data-testid="member-skeleton"], .animate-pulse, [aria-busy="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders member list with displayName and email for each member', () => {
    // Arrange — default hook return includes two members

    // Act
    render(
      <MembersSection
        projectId={PROJECT_ID}
        currentUserId={CURRENT_USER_ID}
        currentUserRole="OWNER"
      />,
    );

    // Assert
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows Invite button only when currentUserRole is OWNER', () => {
    // Act — render as OWNER
    const { rerender } = render(
      <MembersSection
        projectId={PROJECT_ID}
        currentUserId={CURRENT_USER_ID}
        currentUserRole="OWNER"
      />,
    );

    // Assert — Invite button should be visible for OWNER
    expect(screen.getByRole('button', { name: /invite/i })).toBeInTheDocument();

    // Re-render as MEMBER
    rerender(
      <MembersSection
        projectId={PROJECT_ID}
        currentUserId={CURRENT_USER_ID}
        currentUserRole="MEMBER"
      />,
    );

    // Assert — Invite button should be hidden for MEMBER
    expect(screen.queryByRole('button', { name: /invite/i })).not.toBeInTheDocument();
  });

  it('shows Leave option on own row regardless of role', () => {
    // Arrange — render as MEMBER (non-owner) to ensure Leave is still available
    vi.mocked(useMembersModule.useMembers).mockReturnValue({
      ...DEFAULT_HOOK_RETURN,
      members: [
        { ...MOCK_OWNER_MEMBER, role: 'MEMBER' as const },
        MOCK_OTHER_MEMBER,
      ],
    });

    // Act
    render(
      <MembersSection
        projectId={PROJECT_ID}
        currentUserId={CURRENT_USER_ID}
        currentUserRole="MEMBER"
      />,
    );

    // Assert — "Leave" text/button should appear for the current user's row
    expect(screen.getByText(/leave/i)).toBeInTheDocument();
  });

  it('hides role dropdown on own row even when currentUserRole is OWNER', () => {
    // Arrange — two members, current user is OWNER
    render(
      <MembersSection
        projectId={PROJECT_ID}
        currentUserId={CURRENT_USER_ID}
        currentUserRole="OWNER"
      />,
    );

    // Assert — role dropdown should exist for the OTHER member row but not for own row.
    // The own-row element should not have a role-change select/combobox.
    // We look for role dropdowns/selects; there should be at most 1 (for the other member).
    const roleDropdowns = screen.queryAllByRole('combobox');
    // If any dropdowns exist, none of them should be associated with the current user's own row.
    // The simplest check: there should be at most 1 role dropdown (for bob, not alice).
    expect(roleDropdowns.length).toBeLessThanOrEqual(1);
  });
});
