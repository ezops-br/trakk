'use client';

import React from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type Announcements,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { ClipboardList, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import type {
  BoardEvent,
  Role,
  TicketWithRelations,
  ReorderUpdate,
} from '@/lib/types';
import { useColumns } from '@/hooks/use-columns';
import { useTickets } from '@/hooks/use-tickets';
import { useMembers } from '@/hooks/use-members';
import { useLabels } from '@/hooks/use-labels';
import { useProjectEvents } from '@/hooks/use-project-events';
import { useBoardFilters } from '@/hooks/use-board-filters';
import { applyBoardFilters } from '@/lib/filter-utils';
import { UNASSIGNED_SENTINEL } from '@/lib/types';
import { BoardColumn } from './board-column';
import { BoardToolbar } from './board-toolbar';
import { TicketCard } from './ticket-card';
import { CreateTicketDialog } from '@/components/tickets/create-ticket-dialog';
import { TicketDetailSheet } from '@/components/tickets/ticket-detail-sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// Must match SORT_ORDER_GAP in backend/src/services/ticket.service.ts.
const SORT_ORDER_GAP = 1000;

const DELETE_ZONE_ID = 'delete-zone';

function DeleteZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: DELETE_ZONE_ID });
  return (
    <div
      ref={setNodeRef}
      className={[
        'fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all duration-200',
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none',
        isOver
          ? 'border-status-error bg-status-error/20 shadow-lg shadow-status-error/30 scale-110'
          : 'border-trakk-border bg-trakk-surface',
      ].join(' ')}
      aria-label="Drop here to archive"
    >
      <Trash2
        size={22}
        className={isOver ? 'text-status-error' : 'text-trakk-text-secondary'}
      />
    </div>
  );
}

interface KanbanBoardProps {
  projectId: string;
  projectKey: string;
  initialRole: Role;
  initialTicketNumber?: number | null;
  projectIsArchived?: boolean;
}

export function KanbanBoard({
  projectId,
  projectKey,
  initialRole,
  initialTicketNumber,
  projectIsArchived = false,
}: KanbanBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    columns,
    loading: columnsLoading,
    error: columnsError,
    refetch: refetchColumns,
  } = useColumns(projectId);
  const {
    tickets,
    loading: ticketsLoading,
    error: ticketsError,
    createTicket,
    archiveTicket,
    reorderTickets,
    setTickets,
    refetch: refetchTickets,
  } = useTickets(projectId);

  const {
    members,
    loading: membersLoading,
  } = useMembers(projectId);

  const {
    labels,
    loading: labelsLoading,
  } = useLabels(projectId);

  const {
    filters,
    setAssigneeIds,
    setPriorities,
    setLabelIds,
    setSearch,
    clearAll,
    hasActiveFilters,
  } = useBoardFilters();

  const filteredTickets = React.useMemo(
    () => applyBoardFilters(tickets, filters),
    [tickets, filters],
  );

  const [activeTicketId, setActiveTicketId] = React.useState<string | null>(
    null,
  );
  const [openTicketNumber, setOpenTicketNumber] = React.useState<number | null>(
    initialTicketNumber ?? null,
  );
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [createDialogColumnId, setCreateDialogColumnId] = React.useState<
    string | undefined
  >(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // --- Real-time event handling -------------------------------------------
  const handleEvent = React.useCallback(
    (event: BoardEvent) => {
      switch (event.type) {
        case 'ticket.created': {
          const { ticket } = event.payload as { ticket: TicketWithRelations };
          setTickets((prev) =>
            prev.some((t) => t.id === ticket.id)
              ? prev.map((t) => (t.id === ticket.id ? ticket : t))
              : [...prev, ticket],
          );
          break;
        }
        case 'ticket.updated': {
          const { ticket } = event.payload as { ticket: TicketWithRelations };
          setTickets((prev) =>
            prev.map((t) => (t.id === ticket.id ? { ...t, ...ticket } : t)),
          );
          break;
        }
        case 'ticket.deleted': {
          const { ticketId } = event.payload as { ticketId: string };
          setTickets((prev) => prev.filter((t) => t.id !== ticketId));
          break;
        }
        case 'ticket.reordered':
          refetchTickets();
          break;
        case 'column.created':
        case 'column.updated':
        case 'column.deleted':
          refetchColumns();
          break;
        case 'label.created':
        case 'label.updated':
        case 'label.deleted':
        case 'label.assigned':
        case 'label.removed':
          refetchTickets();
          break;
        default:
          break;
      }
    },
    [setTickets, refetchTickets, refetchColumns],
  );

  useProjectEvents(projectId, handleEvent);

  // --- Stale filter ID cleanup --------------------------------------------
  React.useEffect(() => {
    if (membersLoading || labelsLoading) return;
    const validMemberIds = new Set([
      UNASSIGNED_SENTINEL,
      ...members.map((m) => m.user.id),
    ]);
    const validLabelIds = new Set(labels.map((l) => l.id));
    const cleanAssignees = filters.assigneeIds.filter((id) =>
      validMemberIds.has(id),
    );
    const cleanLabels = filters.labelIds.filter((id) => validLabelIds.has(id));
    if (cleanAssignees.length !== filters.assigneeIds.length) {
      setAssigneeIds(cleanAssignees);
    }
    if (cleanLabels.length !== filters.labelIds.length) {
      setLabelIds(cleanLabels);
    }
  }, [members, labels, membersLoading, labelsLoading, filters.assigneeIds, filters.labelIds, setAssigneeIds, setLabelIds]);

  // --- URL sync for the detail sheet --------------------------------------
  const openTicket = React.useCallback(
    (ticketNumber: number) => {
      setOpenTicketNumber(ticketNumber);
      const next = new URLSearchParams(searchParams.toString());
      next.set('ticket', String(ticketNumber));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const closeTicket = React.useCallback(() => {
    setOpenTicketNumber(null);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('ticket');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  // Keep state in sync if the ?ticket= param changes externally.
  React.useEffect(() => {
    const param = searchParams.get('ticket');
    if (param) {
      const n = Number(param);
      if (!Number.isNaN(n)) setOpenTicketNumber(n);
    } else {
      setOpenTicketNumber(null);
    }
  }, [searchParams]);

  // Open the create-ticket dialog when arriving with ?newTicket=true
  // (e.g. from the global command palette), then strip the param.
  React.useEffect(() => {
    if (searchParams.get('newTicket') === 'true') {
      setCreateDialogOpen(true);
      const next = new URLSearchParams(searchParams.toString());
      next.delete('newTicket');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  // --- Drag and drop ------------------------------------------------------
  const handleDragStart = (event: DragStartEvent) => {
    setActiveTicketId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTicketId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const moved = tickets.find((t) => t.id === activeId);
    if (!moved) return;

    // Drop on the trash zone — archive the ticket (soft delete, recoverable).
    if (overId === DELETE_ZONE_ID) {
      void archiveTicket(moved.number);
      return;
    }

    // Determine target column: drop target is either a column id or a ticket id.
    const overTicket = tickets.find((t) => t.id === overId);
    const targetColumnId = overTicket
      ? overTicket.statusColumnId
      : columns.find((c) => c.id === overId)?.id ?? moved.statusColumnId;

    // All other tickets in the target column, sorted by current sort order.
    const columnTickets = tickets
      .filter((t) => t.statusColumnId === targetColumnId && t.id !== activeId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Find insert position relative to the over target.
    let insertIndex = columnTickets.length;
    if (overTicket && overTicket.statusColumnId === targetColumnId) {
      const idx = columnTickets.findIndex((t) => t.id === overId);
      if (idx !== -1) insertIndex = idx;
    }

    // Early exit: same column, same position — nothing to do.
    const sameColumn = moved.statusColumnId === targetColumnId;
    if (sameColumn) {
      const currentIndex = tickets
        .filter((t) => t.statusColumnId === targetColumnId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .findIndex((t) => t.id === activeId);
      if (currentIndex === insertIndex) return;
    }

    // Gap-based sort order: place the moved ticket between its new neighbors
    // using the average of their sort orders. Only send the single moved ticket
    // to the backend unless the gap has collapsed below 1, in which case
    // renumber the whole column with fresh SORT_ORDER_GAP spacing.
    const prev = columnTickets[insertIndex - 1];
    const next = columnTickets[insertIndex];

    let newSortOrder: number;
    if (!prev && !next) {
      newSortOrder = SORT_ORDER_GAP;
    } else if (!prev) {
      newSortOrder = next.sortOrder / 2;
    } else if (!next) {
      newSortOrder = prev.sortOrder + SORT_ORDER_GAP;
    } else {
      newSortOrder = (prev.sortOrder + next.sortOrder) / 2;
    }

    const gap = prev && next ? next.sortOrder - prev.sortOrder : SORT_ORDER_GAP * 2;

    let updates: ReorderUpdate[];
    if (gap < 1) {
      // Renumber the entire column to restore healthy gaps.
      const withMoved = [...columnTickets];
      withMoved.splice(insertIndex, 0, { ...moved, statusColumnId: targetColumnId });
      updates = withMoved.map((t, i) => ({
        ticketId: t.id,
        sortOrder: (i + 1) * SORT_ORDER_GAP,
        statusColumnId: targetColumnId,
      }));
    } else {
      updates = [{ ticketId: activeId, sortOrder: newSortOrder, statusColumnId: targetColumnId }];
    }

    void reorderTickets(updates).catch(() => {
      // Hook reverts optimistic state on failure; nothing else to do here.
    });
  };

  // Screen-reader announcements for drag-and-drop operations (D2 accessibility).
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const t = tickets.find((x) => x.id === String(active.id));
      return `Picked up ticket ${t?.title ?? active.id}.`;
    },
    onDragOver: ({ active: _active, over }) => {
      if (!over) return;
      const col = columns.find((c) => c.id === String(over.id));
      if (col) return `Moving to column ${col.name}.`;
      const overTicket = tickets.find((t) => t.id === String(over.id));
      if (overTicket) {
        const ownerCol = columns.find((c) => c.id === overTicket.statusColumnId);
        return ownerCol ? `Moving in ${ownerCol.name} column.` : undefined;
      }
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return 'Drop cancelled.';
      const t = tickets.find((x) => x.id === String(active.id));
      const col =
        columns.find((c) => c.id === String(over.id)) ??
        columns.find((c) => c.id === tickets.find((x) => x.id === String(over.id))?.statusColumnId);
      return `Dropped ${t?.title ?? 'item'}${col ? ` in ${col.name}` : ''}.`;
    },
    onDragCancel: ({ active }) => {
      const t = tickets.find((x) => x.id === String(active.id));
      return `Cancelled dragging ${t?.title ?? active.id}.`;
    },
  };

  const handleAddTicket = (columnId: string) => {
    setCreateDialogColumnId(columnId);
    setCreateDialogOpen(true);
  };

  const loading = columnsLoading || ticketsLoading;
  const error = columnsError || ticketsError;

  const activeTicket = activeTicketId
    ? tickets.find((t) => t.id === activeTicketId) ?? null
    : null;

  // --- Render -------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex w-[300px] shrink-0 flex-col gap-3 rounded-panel bg-trakk-bg p-3"
          >
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-callout border border-[rgba(255,71,87,0.25)] bg-[rgba(255,71,87,0.06)] border-l-[3px] border-l-status-error px-6 py-5">
        <div className="flex items-start gap-3">
          <AlertTriangle
            size={20}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-status-error"
          />
          <div className="flex flex-col gap-2">
            <p className="font-body text-[15px] text-trakk-text-strong">
              Couldn&apos;t load the board — {error}
            </p>
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  refetchColumns();
                  refetchTickets();
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = tickets.length === 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <BoardToolbar
        projectId={projectId}
        filters={filters}
        members={members}
        labels={labels}
        onAssigneeChange={setAssigneeIds}
        onPriorityChange={setPriorities}
        onLabelChange={setLabelIds}
        onSearchChange={setSearch}
        onClearAll={clearAll}
        isLoadingFilterData={membersLoading || labelsLoading}
      />
      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4 rounded-card border border-trakk-border bg-trakk-surface px-12 py-16 text-center">
            <ClipboardList
              size={48}
              strokeWidth={1.5}
              className="text-trakk-text-secondary"
            />
            <div className="flex flex-col gap-1">
              <h2 className="font-display font-bold text-xl -tracking-wide text-trakk-text">
                No tickets yet
              </h2>
              <p className="font-body text-[15px] text-trakk-text-secondary">
                Create your first ticket to get started.
              </p>
            </div>
            {initialRole !== 'VIEWER' && (
              <Button
                variant="primary"
                className="gap-2"
                onClick={() =>
                  handleAddTicket(columns[0]?.id ?? '')
                }
              >
                <Plus size={16} strokeWidth={2} />
                Create ticket
              </Button>
            )}
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements }}
        >
          <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
            {columns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                tickets={filteredTickets
                  .filter((t) => t.statusColumnId === column.id)
                  .sort((a, b) => a.sortOrder - b.sortOrder)}
                totalCount={tickets.filter((t) => t.statusColumnId === column.id).length}
                hasActiveFilters={hasActiveFilters}
                projectKey={projectKey}
                userRole={initialRole}
                onAddTicket={handleAddTicket}
                onTicketClick={openTicket}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTicket ? (
              <TicketCard
                ticket={activeTicket}
                projectKey={projectKey}
                onClick={() => {}}
                overlay
              />
            ) : null}
          </DragOverlay>
          {initialRole !== 'VIEWER' && (
            <DeleteZone visible={activeTicketId !== null} />
          )}
        </DndContext>
      )}

      <CreateTicketDialog
        projectId={projectId}
        defaultStatusColumnId={createDialogColumnId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreate={createTicket}
      />

      {openTicketNumber !== null && (
        <TicketDetailSheet
          projectId={projectId}
          projectKey={projectKey}
          ticketNumber={openTicketNumber}
          open={openTicketNumber !== null}
          onOpenChange={(o) => {
            if (!o) closeTicket();
          }}
          userRole={initialRole}
          projectIsArchived={projectIsArchived}
        />
      )}
    </div>
  );
}
