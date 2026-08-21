import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Comment, User, Role } from '@/lib/types';

// Mock react-markdown as a passthrough component
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'markdown' }, children),
}));

import { CommentThread } from './CommentThread';

const CURRENT_USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';

const MOCK_CURRENT_USER: User = {
  id: CURRENT_USER_ID,
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  avatarUrl: null,
  themePreference: 'light',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const MOCK_OTHER_USER: User = {
  id: OTHER_USER_ID,
  email: 'bob@example.com',
  displayName: 'Bob Jones',
  avatarUrl: null,
  themePreference: 'light',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const MOCK_OWN_COMMENT: Comment & { author: User } = {
  id: 'comment-uuid-1',
  ticketId: 'ticket-uuid-1',
  authorId: CURRENT_USER_ID,
  body: 'This is my own comment.',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  author: MOCK_CURRENT_USER,
};

const MOCK_OTHER_COMMENT: Comment & { author: User } = {
  id: 'comment-uuid-2',
  ticketId: 'ticket-uuid-1',
  authorId: OTHER_USER_ID,
  body: 'This is someone else comment.',
  createdAt: '2024-01-02T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  author: MOCK_OTHER_USER,
};

const defaultProps = {
  comments: [MOCK_OWN_COMMENT, MOCK_OTHER_COMMENT],
  currentUserId: CURRENT_USER_ID,
  userRole: 'MEMBER' as Role,
  isArchived: false,
  onCreate: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
};

describe('CommentThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders comment list with author name and body text', () => {
    // Arrange & Act
    render(<CommentThread {...defaultProps} />);

    // Assert — author names and comment bodies should be visible
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('This is my own comment.')).toBeInTheDocument();
    expect(screen.getByText('This is someone else comment.')).toBeInTheDocument();
  });

  it('Viewer sees no textarea and no edit/delete buttons', () => {
    // Arrange & Act
    render(<CommentThread {...defaultProps} userRole="VIEWER" />);

    // Assert — no compose area and no action buttons
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('author sees Edit and Delete buttons on own comment; non-author Member does not see them', () => {
    // Arrange & Act
    render(
      <CommentThread
        {...defaultProps}
        comments={[MOCK_OWN_COMMENT, MOCK_OTHER_COMMENT]}
        currentUserId={CURRENT_USER_ID}
        userRole="MEMBER"
      />,
    );

    // Assert — Edit and Delete appear for own comment
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(1);

    // The other user's comment must NOT have an Edit button
    // Both comments are rendered; only MOCK_OWN_COMMENT is authored by currentUser
    // so only one Edit button should appear total
    const editButtons = screen.queryAllByRole('button', { name: /edit/i });
    expect(editButtons).toHaveLength(1);
  });

  it('Owner sees Delete button on another users comment but no Edit button', () => {
    // Arrange — render with only the other user's comment visible (no own comment to avoid ambiguity)
    render(
      <CommentThread
        {...defaultProps}
        comments={[MOCK_OTHER_COMMENT]}
        currentUserId={CURRENT_USER_ID}
        userRole="OWNER"
      />,
    );

    // Assert — Owner sees Delete but no Edit on other user's comment
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });
});
