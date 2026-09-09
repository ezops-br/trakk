import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';

// --- Mocks for Radix-backed primitives --------------------------------------
// Radix Dialog/DropdownMenu portals + animation frames blow the jsdom
// worker's heap when the full tree is rendered. We replace the primitive
// surfaces with minimal stubs that still emit the same `data-testid`s and
// call the same `onSelect`/`onOpenChange`/etc. callbacks.

vi.mock('@/components/ui/dropdown-menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/dropdown-menu')>();
  return {
    ...actual,
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<'button'>>(
      function Trigger(props, ref) {
        return <button ref={ref} {...props} />;
      },
    ),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="dropdown-content-stub">{children}</div>
    ),
    DropdownMenuItem: React.forwardRef<HTMLDivElement, { onSelect?: () => void; children?: React.ReactNode } & React.ComponentPropsWithoutRef<'div'>>(
      function Item({ onSelect, children, ...rest }, ref) {
        return (
          <div
            ref={ref}
            role="menuitem"
            tabIndex={0}
            {...rest}
            onClick={(e) => {
              if (rest.onClick) rest.onClick(e);
              if (onSelect) onSelect();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.();
              }
            }}
          >
            {children}
          </div>
        );
      },
    ),
  };
});

vi.mock('@/components/ui/dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/dialog')>();
  return {
    ...actual,
    Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <div data-open={open ? 'true' : 'false'}>{children}</div>
    ),
    DialogContent: ({ children, ...rest }: { children: React.ReactNode }) => (
      <div {...rest}>{children}</div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

// --- Data hooks -------------------------------------------------------------

const ticketsState: { current: Array<Record<string, unknown>> } = {
  current: [],
};

vi.mock('@/hooks/use-tickets', () => ({
  useTickets: () => ({
    tickets: ticketsState.current,
    loading: false,
    error: null,
    createTicket: vi.fn(),
    deleteTicket: vi.fn(),
    reorderTickets: vi.fn(),
    setTickets: (
      updater:
        | ((prev: Array<Record<string, unknown>>) => Array<Record<string, unknown>>)
        | Array<Record<string, unknown>>,
    ) => {
      ticketsState.current =
        typeof updater === 'function' ? updater(ticketsState.current) : updater;
    },
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-columns', () => ({
  useColumns: () => ({
    columns: [
      { id: 'col-1', projectId: 'p1', name: 'To Do', position: 0, createdAt: '' },
      { id: 'col-2', projectId: 'p1', name: 'In Progress', position: 1, createdAt: '' },
    ],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-members', () => ({
  useMembers: () => ({
    members: [
      {
        id: 'm1',
        projectId: 'p1',
        userId: 'u1',
        role: 'MEMBER',
        joinedAt: '',
        user: { id: 'u1', email: 'a@b.c', displayName: 'Alice', avatarUrl: null },
      },
      {
        id: 'm2',
        projectId: 'p1',
        userId: 'u2',
        role: 'MEMBER',
        joinedAt: '',
        user: { id: 'u2', email: 'b@b.c', displayName: 'Bob', avatarUrl: null },
      },
    ],
    loading: false,
  }),
}));

vi.mock('@/hooks/use-labels', () => ({
  useLabels: () => ({
    labels: [
      { id: 'lbl-1', name: 'bug', color: '#ef4444' },
      { id: 'lbl-2', name: 'feature', color: '#22c55e' },
    ],
    loading: false,
  }),
}));

const bulkPatch = vi.fn();
vi.mock('@/hooks/use-bulk-operations', () => ({
  useBulkOperations: () => ({
    bulkUpdate: bulkPatch,
    loading: false,
    error: null,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// --- Imports (must come after mocks) ----------------------------------------

import { BulkActionBar } from '@/components/board/BulkActionBar';
import { SelectionProvider, useSelectionContext } from '@/contexts/selection-context';
import { toast } from 'sonner';

const PROJECT_ID = 'proj-uuid-1';

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 't-1',
    projectId: PROJECT_ID,
    number: 1,
    title: 'Test ticket',
    description: null,
    statusColumnId: 'col-1',
    priority: 'MEDIUM',
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
    ...overrides,
  };
}

/** Drives selection from the test (since the checkbox isn't rendered in unit tests). */
function SelectionDriver() {
  const sel = useSelectionContext();
  return (
    <div>
      <button data-testid="driver-toggle-1" onClick={() => sel.toggleSelect(1)} />
      <button data-testid="driver-toggle-2" onClick={() => sel.toggleSelect(2)} />
    </div>
  );
}

function renderWithSelection(ui: React.ReactNode) {
  return render(
    <SelectionProvider>
      <SelectionDriver />
      {ui}
    </SelectionProvider>,
  );
}

// --- Tests ------------------------------------------------------------------

describe('BulkActionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketsState.current = [
      makeTicket({ id: 't-1', number: 1 }),
      makeTicket({ id: 't-2', number: 2 }),
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('is not rendered when there is no selection', () => {
    renderWithSelection(<BulkActionBar projectId={PROJECT_ID} userRole="OWNER" />);
    expect(screen.queryByTestId('bulk-action-bar')).toBeNull();
  });

  it('renders the count and Clear button when at least one ticket is selected', () => {
    renderWithSelection(<BulkActionBar projectId={PROJECT_ID} userRole="OWNER" />);
    fireEvent.click(screen.getByTestId('driver-toggle-1'));
    expect(screen.getByTestId('bulk-action-bar')).not.toBeNull();
    expect(screen.getByText(/tickets selected/i)).toHaveTextContent(
      '1 tickets selected',
    );
    expect(screen.getByTestId('bulk-bar-clear')).toBeInTheDocument();
  });

  it('the Clear button empties the selection', async () => {
    renderWithSelection(<BulkActionBar projectId={PROJECT_ID} userRole="OWNER" />);
    fireEvent.click(screen.getByTestId('driver-toggle-1'));
    fireEvent.click(screen.getByTestId('driver-toggle-2'));
    expect(screen.getByText(/tickets selected/i)).toHaveTextContent(
      '2 tickets selected',
    );
    fireEvent.click(screen.getByTestId('bulk-bar-clear'));
    await waitFor(() =>
      expect(screen.queryByTestId('bulk-action-bar')).toBeNull(),
    );
  });

  it('non-delete success path triggers toast.success and clears selection', async () => {
    bulkPatch.mockResolvedValue({ updated: 1, tickets: [] });
    ticketsState.current = [
      makeTicket({ id: 't-1', number: 1, assigneeId: 'user-1' }),
      makeTicket({ id: 't-2', number: 2 }),
    ];
    renderWithSelection(<BulkActionBar projectId={PROJECT_ID} userRole="OWNER" />);
    fireEvent.click(screen.getByTestId('driver-toggle-1'));
    fireEvent.click(screen.getByTestId('bulk-status-trigger'));
    fireEvent.click(screen.getByTestId('bulk-status-option-col-2'));
    await waitFor(() =>
      expect(bulkPatch).toHaveBeenCalledWith({
        ticketNumbers: [1],
        operation: 'status',
        value: 'col-2',
      }),
    );
    await waitFor(() =>
      expect(toast.success as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        '1 tickets updated',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('bulk-action-bar')).toBeNull(),
    );
  });

  it('failure path reverts setTickets and surfaces a toast.error', async () => {
    bulkPatch.mockRejectedValue(new Error('Boom'));
    ticketsState.current = [
      makeTicket({ id: 't-1', number: 1, assigneeId: 'user-1' }),
      makeTicket({ id: 't-2', number: 2 }),
    ];
    const before = JSON.parse(JSON.stringify(ticketsState.current));
    renderWithSelection(<BulkActionBar projectId={PROJECT_ID} userRole="OWNER" />);
    fireEvent.click(screen.getByTestId('driver-toggle-1'));
    fireEvent.click(screen.getByTestId('bulk-status-trigger'));
    fireEvent.click(screen.getByTestId('bulk-status-option-col-2'));
    await waitFor(() => expect(bulkPatch).toHaveBeenCalled());
    await waitFor(() =>
      expect(toast.error as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('Boom'),
    );
    expect(JSON.parse(JSON.stringify(ticketsState.current))).toEqual(before);
    // Selection remains so the user can retry.
    expect(screen.queryByTestId('bulk-action-bar')).not.toBeNull();
  });

  it('delete path waits for confirmation and filters local state on success', async () => {
    bulkPatch.mockResolvedValue({ deleted: 1, ticketNumbers: [1] });
    renderWithSelection(<BulkActionBar projectId={PROJECT_ID} userRole="OWNER" />);
    fireEvent.click(screen.getByTestId('driver-toggle-1'));
    fireEvent.click(screen.getByTestId('bulk-delete-trigger'));
    expect(screen.getByTestId('bulk-delete-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bulk-delete-confirm'));
    await waitFor(() =>
      expect(bulkPatch).toHaveBeenCalledWith({
        ticketNumbers: [1],
        operation: 'delete',
      }),
    );
    await waitFor(() =>
      expect(ticketsState.current.find((t) => t.number === 1)).toBeUndefined(),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('bulk-action-bar')).toBeNull(),
    );
  });

  it('bulk-move to In Progress is blocked when any selected ticket is unassigned', async () => {
    // Default ticket fixture has assigneeId: null, so this directly exercises
    // the unassigned-to-in-progress guard.
    bulkPatch.mockResolvedValue({ updated: 1, tickets: [] });
    renderWithSelection(<BulkActionBar projectId={PROJECT_ID} userRole="OWNER" />);
    fireEvent.click(screen.getByTestId('driver-toggle-1'));
    fireEvent.click(screen.getByTestId('bulk-status-trigger'));
    fireEvent.click(screen.getByTestId('bulk-status-option-col-2'));
    await waitFor(() =>
      expect(toast.error as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        '1 ticket(s) must be assigned before they can move to In Progress',
      ),
    );
    expect(bulkPatch).not.toHaveBeenCalled();
  });

  it('VIEWER role does not render the bar even after selection', () => {
    // Direct unit test of the conditional return: bypass the SelectionDriver
    // because under VIEWER, the bar should never render regardless of state.
    // This test sits in this file rather than the describe above to avoid
    // an unrelated worker OOM during the suite run (forces a single render).
    function StaticSelectionOne() {
      const sel = useSelectionContext();
      // Synchronously set selection during render — the bar will rerender
      // once with selection=true, then return null because userRole='VIEWER'.
      if (sel.count === 0) {
        sel.toggleSelect(1);
      }
      return null;
    }
    render(
      <SelectionProvider>
        <StaticSelectionOne />
        <BulkActionBar projectId={PROJECT_ID} userRole="VIEWER" />
      </SelectionProvider>,
    );
    expect(screen.queryByTestId('bulk-action-bar')).toBeNull();
  });
});