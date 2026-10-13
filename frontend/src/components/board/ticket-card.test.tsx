import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TicketCard } from '@/components/board/ticket-card';
import type { TicketWithRelations } from '@/lib/types';

// Mock dnd-kit's useSortable — TicketCard calls it directly and we don't
// want a DndContext provider in unit tests. Mirrors the pattern in
// board-column.test.tsx (which mocks useDroppable and SortableContext).
vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>();
  return {
    ...actual,
    useSortable: vi.fn(() => ({
      attributes: {},
      listeners: undefined,
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    })),
  };
});

const MOCK_REPORTER = {
  id: 'user-1',
  displayName: 'Alice Reporter',
  avatarUrl: null,
  email: 'alice@example.com',
};

const MOCK_ASSIGNEE = {
  id: 'user-2',
  displayName: 'Bob Assignee',
  avatarUrl: null,
  email: 'bob@example.com',
};

const MOCK_STATUS_COLUMN = {
  id: 'col-1',
  projectId: 'proj-1',
  name: 'In Progress',
  position: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const makeTicket = (overrides: Partial<TicketWithRelations> = {}): TicketWithRelations => ({
  id: 't-1',
  projectId: 'proj-1',
  number: 42,
  title: 'Test ticket',
  description: null,
  statusColumnId: 'col-1',
  priority: 'MEDIUM',
  assigneeId: 'user-2',
  reporterId: 'user-1',
  sortOrder: 0,
  // Older than 7 days so formatRelativeTime falls back to formatDate — the
  // visible label's text is therefore "Jan 1, 2024" (UTC) and stays stable
  // across runs.
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  assignee: MOCK_ASSIGNEE,
  reporter: MOCK_REPORTER,
  statusColumn: MOCK_STATUS_COLUMN,
  labels: [],
  ...overrides,
});

describe('TicketCard — footer tooltip (TRAKK-014)', () => {
  it('1. renders the relative-time label for the ticket updatedAt', () => {
    // Arrange + Act
    render(
      <TicketCard
        ticket={makeTicket()}
        projectKey="TRAKK"
        onClick={vi.fn()}
      />,
    );

    // Assert — visible label uses formatRelativeTime, which for an
    // updatedAt older than 7 days falls back to formatDate output.
    // 2024-01-01T00:00:00Z → "Jan 1, 2024" in en-US.
    expect(screen.getByText('Jan 1, 2024')).toBeInTheDocument();
  });

  it('2. does NOT show the absolute-date tooltip content by default', () => {
    // Arrange + Act
    render(
      <TicketCard
        ticket={makeTicket()}
        projectKey="TRAKK"
        onClick={vi.fn()}
      />,
    );

    // Assert — tooltip content (Jan 1, 2024, 12:00 AM) is mounted only when
    // open, so it must not be in the DOM until the user hovers/focuses.
    expect(screen.queryByText(/Jan 1, 2024, 12:00 AM/)).not.toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('3. hovering the trigger reveals the tooltip content with role="tooltip"', async () => {
    // Arrange
    render(
      <TicketCard
        ticket={makeTicket()}
        projectKey="TRAKK"
        onClick={vi.fn()}
      />,
    );

    // Act — fire pointerenter; TooltipTrigger injects this on the cloned child.
    const trigger = screen.getByText('Jan 1, 2024');
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });

    // Assert — TooltipContent mounts when open, with role="tooltip".
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Jan 1, 2024, 12:00 AM');
  });

  it('4. focusing the trigger reveals the tooltip (keyboard a11y)', async () => {
    // Arrange
    render(
      <TicketCard
        ticket={makeTicket()}
        projectKey="TRAKK"
        onClick={vi.fn()}
      />,
    );

    // Act — focus the trigger (the span with tabIndex={0}).
    const trigger = screen.getByText('Jan 1, 2024');
    fireEvent.focus(trigger);

    // Assert
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Jan 1, 2024, 12:00 AM');
  });

  it('5. clicking the trigger does NOT call onClick (stopPropagation)', () => {
    // Arrange
    const onClick = vi.fn();
    render(
      <TicketCard
        ticket={makeTicket()}
        projectKey="TRAKK"
        onClick={onClick}
      />,
    );

    // Act — click the relative-time label, which calls stopPropagation on the
    // span. fireEvent.click bubbles through React synthetic events unless the
    // handler stops propagation, so this should NOT reach the outer div.
    const trigger = screen.getByText('Jan 1, 2024');
    fireEvent.click(trigger);

    // Assert — onClick must NOT have been called.
    expect(onClick).not.toHaveBeenCalled();
  });

  it('6. existing priority, assignee, and drag handle still render', () => {
    // Arrange + Act
    render(
      <TicketCard
        ticket={makeTicket()}
        projectKey="TRAKK"
        onClick={vi.fn()}
      />,
    );

    // Assert — priority badge text (MEDIUM label).
    expect(screen.getByText('Medium')).toBeInTheDocument();
    // Assignee avatar fallback shows initial.
    expect(screen.getByText('B')).toBeInTheDocument();
    // Drag handle (only when not overlay).
    expect(screen.getByLabelText('Drag to reorder')).toBeInTheDocument();
    // Ticket ID.
    expect(screen.getByText('TRAKK-42')).toBeInTheDocument();
    // Title.
    expect(screen.getByText('Test ticket')).toBeInTheDocument();
  });
});