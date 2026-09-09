import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';

// Capture the latest onEvent callback that KanbanBoard passes to
// useProjectEvents so the test can drive it synchronously.
let capturedOnEvent: ((event: unknown) => void) | null = null;
vi.mock('@/hooks/use-project-events', () => ({
  useProjectEvents: (
    _projectId: string,
    onEvent: (event: unknown) => void,
  ) => {
    capturedOnEvent = onEvent;
  },
}));

// Mock dnd-kit hooks — they require a DndContext provider which we don't want
// in unit tests.
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
    SortableContext: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/projects/proj-uuid-1/board',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the data hooks so the test only exercises the SSE handler, not the
// full board data-fetching flow.
const MOCK_TICKET_1 = {
  id: 'ticket-uuid-1',
  projectId: 'proj-uuid-1',
  number: 1,
  title: 'Original',
  description: null,
  statusColumnId: 'col-1',
  priority: 'MEDIUM' as const,
  assigneeId: null,
  dueDate: null,
  reporterId: 'user-1',
  sortOrder: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  assignee: null,
  reporter: { id: 'user-1', displayName: 'A', avatarUrl: null, email: 'a@b.c' },
  statusColumn: { id: 'col-1', name: 'To Do', position: 0 },
  labels: [],
};

const MOCK_COLUMN = {
  id: 'col-1',
  projectId: 'proj-uuid-1',
  name: 'To Do',
  position: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const MOCK_TICKET_1_OVERDUE = {
  ...MOCK_TICKET_1,
  dueDate: '2024-01-01T00:00:00.000Z',
};

vi.mock('@/hooks/use-columns', () => ({
  useColumns: () => ({
    columns: [MOCK_COLUMN],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// useTickets owns the local tickets state; the test asserts behavior by
// spying on its setTickets. We expose the current value via a module-scoped
// ref so the test can read it after the handler runs.
const ticketsState: { current: typeof MOCK_TICKET_1[] } = { current: [] };
vi.mock('@/hooks/use-tickets', () => ({
  useTickets: () => ({
    tickets: ticketsState.current,
    loading: false,
    error: null,
    createTicket: vi.fn(),
    deleteTicket: vi.fn(),
    reorderTickets: vi.fn(),
    setTickets: (updater: (prev: typeof MOCK_TICKET_1[]) => typeof MOCK_TICKET_1[]) => {
      ticketsState.current = updater(ticketsState.current);
    },
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({ members: [], loading: false }),
}));

vi.mock('@/hooks/use-labels', () => ({
  useLabels: () => ({ labels: [], loading: false }),
}));

// CreateTicketDialog now calls useTemplates (template picker) and
// useAddTicketLabel (sequential label attach after create). Both are
// side-effect-free here — the SSE-handler test never opens the dialog.
vi.mock('@/hooks/use-templates', () => ({
  useTemplates: () => ({ templates: [], loading: false }),
}));
vi.mock('@/hooks/use-add-ticket-label', () => ({
  useAddTicketLabel: () => ({ addLabel: vi.fn() }),
}));

vi.mock('@/hooks/use-board-filters', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/use-board-filters')>();
  return {
    ...actual,
    useBoardFilters: () => ({
      filters: {
        assigneeIds: [],
        priorities: [],
        labelIds: [],
        search: '',
        dueDateFilter: 'all',
        dueDateFrom: null,
        dueDateTo: null,
      },
      setAssigneeIds: vi.fn(),
      setPriorities: vi.fn(),
      setLabelIds: vi.fn(),
      setSearch: vi.fn(),
      setDueDateFilter: vi.fn(),
      sort: 'sortOrder',
      setSort: vi.fn(),
      order: 'asc',
      setOrder: vi.fn(),
      clearAll: vi.fn(),
      hasActiveFilters: false,
    }),
  };
});

import { KanbanBoard } from '@/components/board/kanban-board';
import { apiClient } from '@/lib/api-client';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;
const PROJECT_ID = 'proj-uuid-1';

describe('KanbanBoard — ticket.overdue SSE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnEvent = null;
    ticketsState.current = [MOCK_TICKET_1];
  });

  it('refetches the ticket and replaces the matching row in local state', async () => {
    // Arrange — apiClient.get returns the freshly-fetched overdue ticket.
    mockGet.mockResolvedValue({ ticket: MOCK_TICKET_1_OVERDUE });

    // Act — render the board; the SSE handler captures via useProjectEvents.
    render(<KanbanBoard projectId={PROJECT_ID} projectKey="TRAKK" initialRole="OWNER" />);
    expect(capturedOnEvent).not.toBeNull();

    // Drive the SSE event with the ticket's id (not the number).
    await act(async () => {
      capturedOnEvent!({
        type: 'ticket.overdue',
        payload: { ticketId: 'ticket-uuid-1' },
      });
    });

    // Assert — the refetch URL uses the ticket's number, NOT its id.
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        `/api/v1/projects/${PROJECT_ID}/tickets/${MOCK_TICKET_1.number}`,
      );
    });
    // Local row is replaced with the freshly-fetched (overdue) ticket.
    expect(ticketsState.current).toHaveLength(1);
    expect(ticketsState.current[0]).toMatchObject({
      id: 'ticket-uuid-1',
      dueDate: '2024-01-01T00:00:00.000Z',
    });
  });

  it('no-ops when the ticket is not in local state', async () => {
    // Arrange — the ticketId in the event is unknown to the local state.
    mockGet.mockResolvedValue({ ticket: MOCK_TICKET_1_OVERDUE });

    // Act
    render(<KanbanBoard projectId={PROJECT_ID} projectKey="TRAKK" initialRole="OWNER" />);
    await act(async () => {
      capturedOnEvent!({
        type: 'ticket.overdue',
        payload: { ticketId: 'unknown-ticket-id' },
      });
    });

    // Assert — no fetch made; local state untouched.
    expect(mockGet).not.toHaveBeenCalled();
    expect(ticketsState.current).toEqual([MOCK_TICKET_1]);
  });

  it('swallows fetch errors and leaves local state intact', async () => {
    // Arrange — refetch fails (network blip).
    mockGet.mockRejectedValue(new Error('Network error'));

    // Act
    render(<KanbanBoard projectId={PROJECT_ID} projectKey="TRAKK" initialRole="OWNER" />);
    await act(async () => {
      capturedOnEvent!({
        type: 'ticket.overdue',
        payload: { ticketId: 'ticket-uuid-1' },
      });
    });

    // Assert — the fetch was attempted, but local state was not replaced.
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });
    expect(ticketsState.current).toEqual([MOCK_TICKET_1]);
  });
});
