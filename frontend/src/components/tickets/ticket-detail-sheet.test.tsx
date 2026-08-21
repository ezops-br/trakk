import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const mockDeleteTicketPermanently = vi.fn();

// Mock react-markdown as a passthrough component (ESM-only, heavy in jsdom).
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'markdown' }, children),
}));
vi.mock('rehype-sanitize', () => ({ default: () => undefined }));

const MOCK_TICKET_DETAIL = {
  id: 'ticket-uuid-1',
  projectId: 'proj-uuid-1',
  number: 42,
  title: 'Fix login bug',
  description: null,
  statusColumnId: 'col-1',
  priority: 'HIGH' as const,
  assigneeId: null,
  reporterId: 'user-uuid-1',
  sortOrder: 1000,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  assignee: null,
  reporter: { id: 'user-uuid-1', displayName: 'Alice', avatarUrl: null },
  statusColumn: { id: 'col-1', name: 'To Do', position: 0 },
  labels: [],
  activityLog: [],
};

vi.mock('@/hooks/use-ticket-detail', () => ({
  useTicketDetail: () => ({
    ticket: MOCK_TICKET_DETAIL,
    loading: false,
    error: null,
    updateTicket: vi.fn(),
    addLabel: vi.fn(),
    removeLabel: vi.fn(),
    deleteTicketPermanently: mockDeleteTicketPermanently,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-columns', () => ({
  useColumns: () => ({
    columns: [{ id: 'col-1', projectId: 'proj-uuid-1', name: 'To Do', position: 0 }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ members: [], loading: false, error: null }),
}));

vi.mock('@/hooks/use-labels', () => ({
  useLabels: () => ({ labels: [], loading: false, error: null }),
}));

vi.mock('@/hooks/use-comments', () => ({
  useComments: () => ({
    comments: [],
    loading: false,
    error: null,
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-meetings', () => ({
  useMeetings: () => ({
    meetings: [],
    loading: false,
    error: null,
    nextCursor: null,
    fetchNextPage: vi.fn(),
    scheduleMeeting: vi.fn(),
    updateMeeting: vi.fn(),
    cancelMeeting: vi.fn(),
    startInstantMeeting: vi.fn(),
    setMeetings: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-uuid-1', displayName: 'Alice', email: 'a@b.c', avatarUrl: null },
    loading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/use-project-events', () => ({
  useProjectEvents: () => undefined,
}));

vi.mock('@/components/tickets/CommentThread', () => ({
  CommentThread: () => React.createElement('div', { 'data-testid': 'comment-thread' }),
}));

vi.mock('@/components/meetings/MeetingCard', () => ({
  MeetingCard: () => null,
}));

vi.mock('@/components/meetings/ScheduleMeetingDialog', () => ({
  ScheduleMeetingDialog: () => null,
}));

vi.mock('@/components/meetings/QuickMeetButton', () => ({
  QuickMeetButton: () => null,
}));

import { TicketDetailSheet } from './ticket-detail-sheet';

const baseProps = {
  projectId: 'proj-uuid-1',
  projectKey: 'TRAKK',
  ticketNumber: 42,
  open: true,
  onOpenChange: vi.fn(),
};

// The 3-dot header menu is identified by this accessible name.
const ACTIONS_LABEL = /ticket actions/i;

function openActionsMenu() {
  const trigger = screen.getByRole('button', { name: ACTIONS_LABEL });
  // Radix DropdownMenuTrigger opens on Enter; pointer sequences are unreliable in jsdom.
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

async function openDeleteDialog() {
  openActionsMenu();
  const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
  fireEvent.click(deleteItem);
  // The Sheet itself is also role="dialog" (its accessible name is the ticket
  // title), so match the confirmation dialog by its own title.
  return screen.findByRole('dialog', { name: /delete/i });
}

describe('TicketDetailSheet — permanent delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the 3-dot actions menu trigger for a MEMBER', () => {
    // Arrange & Act
    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    // Assert
    expect(screen.getByRole('button', { name: ACTIONS_LABEL })).toBeInTheDocument();
  });

  it('does not render the actions menu trigger for a VIEWER', () => {
    // Arrange & Act
    render(<TicketDetailSheet {...baseProps} userRole="VIEWER" />);

    // Assert — VIEWERs get no permanent-delete affordance at all.
    expect(screen.queryByRole('button', { name: ACTIONS_LABEL })).not.toBeInTheDocument();
  });

  it('confirming the dialog calls deleteTicketPermanently, and the copy states the action is irreversible', async () => {
    // Arrange
    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    // Act
    const dialog = await openDeleteDialog();

    // Assert — wording must make the permanence explicit before confirming.
    expect(dialog).toHaveTextContent(/permanently/i);
    expect(dialog).toHaveTextContent(/cannot be undone/i);

    fireEvent.click(
      within(dialog).getByRole('button', { name: /^(delete|confirm)/i }),
    );
    await waitFor(() => expect(mockDeleteTicketPermanently).toHaveBeenCalledTimes(1));
  });

  it('cancelling the dialog does not call deleteTicketPermanently', async () => {
    // Arrange
    render(<TicketDetailSheet {...baseProps} userRole="MEMBER" />);

    // Act
    const dialog = await openDeleteDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    // Assert
    expect(mockDeleteTicketPermanently).not.toHaveBeenCalled();
  });
});
