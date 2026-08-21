import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Captures the onDragEnd handler that KanbanBoard hands to DndContext so the
// drop can be driven directly — dnd-kit pointer sequences are not reproducible
// in jsdom.
const mockCaptureDragEnd = vi.fn();
const mockArchiveTicket = vi.fn();
const mockDeleteTicket = vi.fn();
const mockReorderTickets = vi.fn();

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (event: unknown) => void;
  }) => {
    mockCaptureDragEnd(onDragEnd);
    return React.createElement('div', { 'data-testid': 'dnd-context' }, children);
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  PointerSensor: class PointerSensor {},
  KeyboardSensor: class KeyboardSensor {},
  useSensor: () => ({}),
  useSensors: () => [],
  closestCorners: () => null,
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  sortableKeyboardCoordinates: () => ({}),
  arrayMove: (arr: unknown[]) => arr,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/projects/proj-uuid-1/board',
  useSearchParams: () => new URLSearchParams(),
}));

const MOCK_TICKET = {
  id: 'ticket-uuid-1',
  projectId: 'proj-uuid-1',
  number: 7,
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
};

vi.mock('@/hooks/use-columns', () => ({
  useColumns: () => ({
    columns: [{ id: 'col-1', projectId: 'proj-uuid-1', name: 'To Do', position: 0 }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-tickets', () => ({
  useTickets: () => ({
    tickets: [MOCK_TICKET],
    total: 1,
    page: 1,
    pageSize: 50,
    loading: false,
    error: null,
    createTicket: vi.fn(),
    deleteTicket: mockDeleteTicket,
    archiveTicket: mockArchiveTicket,
    reorderTickets: mockReorderTickets,
    setTickets: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ members: [], loading: false, error: null }),
}));

vi.mock('@/hooks/use-labels', () => ({
  useLabels: () => ({ labels: [], loading: false, error: null }),
}));

vi.mock('@/hooks/use-project-events', () => ({
  useProjectEvents: () => undefined,
}));

vi.mock('@/hooks/use-board-filters', () => ({
  useBoardFilters: () => ({
    filters: { assigneeIds: [], priorities: [], labelIds: [], search: '' },
    setAssigneeIds: vi.fn(),
    setPriorities: vi.fn(),
    setLabelIds: vi.fn(),
    setSearch: vi.fn(),
    clearAll: vi.fn(),
    hasActiveFilters: false,
  }),
}));

vi.mock('./board-column', () => ({
  BoardColumn: () => React.createElement('div', { 'data-testid': 'board-column' }),
}));

vi.mock('./board-toolbar', () => ({
  BoardToolbar: () => React.createElement('div', { 'data-testid': 'board-toolbar' }),
}));

vi.mock('./ticket-card', () => ({
  TicketCard: () => React.createElement('div', { 'data-testid': 'ticket-card' }),
}));

vi.mock('@/components/tickets/create-ticket-dialog', () => ({
  CreateTicketDialog: () => null,
}));

vi.mock('@/components/tickets/ticket-detail-sheet', () => ({
  TicketDetailSheet: () => null,
}));

import { KanbanBoard } from './kanban-board';

describe('KanbanBoard — drag to trash archives instead of deleting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls archiveTicket (not deleteTicket) when a ticket is dropped on the delete zone', async () => {
    // Arrange
    render(
      <KanbanBoard
        projectId="proj-uuid-1"
        projectKey="TRAKK"
        initialRole="MEMBER"
      />,
    );
    await waitFor(() => expect(mockCaptureDragEnd).toHaveBeenCalled());
    const onDragEnd = mockCaptureDragEnd.mock.calls.at(-1)![0] as (e: unknown) => void;

    // Act — drop the ticket onto the trash bin droppable.
    onDragEnd({
      active: { id: 'ticket-uuid-1' },
      over: { id: 'delete-zone' },
    });

    // Assert — soft delete only; no permanent delete and no reorder side effect.
    expect(mockArchiveTicket).toHaveBeenCalledWith(7);
    expect(mockDeleteTicket).not.toHaveBeenCalled();
    expect(mockReorderTickets).not.toHaveBeenCalled();
  });
});
