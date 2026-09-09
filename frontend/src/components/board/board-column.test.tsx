import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BoardColumn } from '@/components/board/board-column';
import { SelectionProvider } from '@/contexts/selection-context';
import type { StatusColumn, TicketWithRelations } from '@/lib/types';

// Mock dnd-kit hooks — they require a DndContext provider which we don't want in unit tests
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  };
});

vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/sortable')>();
  return {
    ...actual,
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const MOCK_COLUMN: StatusColumn = {
  id: 'col-1',
  projectId: 'proj-1',
  name: 'In Progress',
  position: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const makeTicket = (id: string): TicketWithRelations => ({
  id,
  projectId: 'proj-1',
  number: 1,
  title: `Ticket ${id}`,
  description: null,
  statusColumnId: 'col-1',
  priority: 'MEDIUM',
  assigneeId: null,
  dueDate: null,
  reporterId: 'user-1',
  sortOrder: 0,
  blockedBy: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  assignee: null,
  reporter: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'alice@example.com' },
  statusColumn: MOCK_COLUMN,
  labels: [],
});

const BASE_PROPS = {
  column: MOCK_COLUMN,
  tickets: [makeTicket('t-1'), makeTicket('t-2')],
  projectKey: 'TRAKK',
  userRole: 'OWNER',
  onAddTicket: vi.fn(),
  onTicketClick: vi.fn(),
  totalCount: 5,
  hasActiveFilters: false,
};

function renderColumn(ui: React.ReactNode) {
  return render(<SelectionProvider>{ui}</SelectionProvider>);
}

describe('BoardColumn — count display', () => {
  it('shows only the total count when hasActiveFilters is false', () => {
    // Arrange + Act
    renderColumn(<BoardColumn {...BASE_PROPS} hasActiveFilters={false} totalCount={5} tickets={[makeTicket('t-1'), makeTicket('t-2')]} />);

    // Assert — shows "5" (total count), not "2 of 5"
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.queryByText(/of/i)).not.toBeInTheDocument();
  });

  it('shows "N of M" when hasActiveFilters is true', () => {
    // Arrange + Act
    renderColumn(<BoardColumn {...BASE_PROPS} hasActiveFilters={true} totalCount={5} tickets={[makeTicket('t-1'), makeTicket('t-2')]} />);

    // Assert — shows "2 of 5"
    expect(screen.getByText(/2.*of.*5/i)).toBeInTheDocument();
  });

  it('shows "0 of M" when filters are active but no tickets pass', () => {
    // Arrange + Act
    renderColumn(<BoardColumn {...BASE_PROPS} hasActiveFilters={true} totalCount={3} tickets={[]} />);

    // Assert
    expect(screen.getByText(/0.*of.*3/i)).toBeInTheDocument();
  });
});

describe('BoardColumn — drag handle visibility', () => {
  it('renders the drag handle on each ticket by default', () => {
    // Arrange + Act
    renderColumn(<BoardColumn {...BASE_PROPS} />);

    // Assert — there is one "Drag to reorder" button per ticket
    const handles = screen.getAllByRole('button', { name: /drag to reorder/i });
    expect(handles.length).toBe(BASE_PROPS.tickets.length);
  });

  it('hides the drag handle when hideDragHandle is true', () => {
    // Arrange + Act
    renderColumn(<BoardColumn {...BASE_PROPS} hideDragHandle={true} />);

    // Assert — no "Drag to reorder" button is present
    expect(
      screen.queryByRole('button', { name: /drag to reorder/i }),
    ).not.toBeInTheDocument();
  });
});