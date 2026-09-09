'use client';

import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  Loader2,
  Tag as TagIcon,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSelectionContext } from '@/contexts/selection-context';
import { useTickets } from '@/hooks/use-tickets';
import { useColumns } from '@/hooks/use-columns';
import { useMembers } from '@/hooks/use-members';
import { useLabels } from '@/hooks/use-labels';
import { useBulkOperations } from '@/hooks/use-bulk-operations';
import type {
  BulkOperation,
  Priority,
  StatusColumn,
  TicketWithRelations,
} from '@/lib/types';
import { UNASSIGNED_SENTINEL } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string; dotClass: string }> = [
  { value: 'LOW', label: 'Low', dotClass: 'bg-trakk-text-secondary' },
  { value: 'MEDIUM', label: 'Medium', dotClass: 'bg-trakk-teal' },
  { value: 'HIGH', label: 'High', dotClass: 'bg-orange-500' },
  { value: 'URGENT', label: 'Urgent', dotClass: 'bg-red-500' },
  { value: 'NONE', label: 'None', dotClass: 'bg-trakk-text-secondary/40' },
];

/**
 * Returns true when a column name (case- and format-insensitive) refers to
 * the "In Progress" column. Mirrors the backend matcher used by the
 * unassigned-to-in-progress guard so the UI rejects the same moves the API
 * would.
 */
function isInProgressColumnName(name: string) {
  return name.toLowerCase().replace(/[_\s]+/g, ' ').trim() === 'in progress';
}

interface BulkActionBarProps {
  projectId: string;
  userRole: string;
}

interface OptimisticSnapshot {
  tickets: TicketWithRelations[];
}

export function BulkActionBar({ projectId, userRole }: BulkActionBarProps) {
  const selection = useSelectionContext();
  const { tickets, setTickets } = useTickets(projectId);
  const { columns } = useColumns(projectId);
  const { members } = useMembers(projectId);
  const { labels } = useLabels(projectId);
  const { bulkUpdate, loading } = useBulkOperations(projectId);
  const [labelMode, setLabelMode] = useState<'addLabel' | 'removeLabel'>(
    'addLabel',
  );
  const [deleteOpen, setDeleteOpen] = useState(false);

  const selectedIds = useMemo(
    () => Array.from(selection.selectedNumbers),
    [selection.selectedNumbers],
  );

  // Hide the bar entirely when there's no selection or the user can't edit.
  if (userRole === 'VIEWER' || !selection.hasSelection) return null;

  const captureSnapshot = (): OptimisticSnapshot => ({ tickets });

  /**
   * Applies an optimistic edit to the local ticket list, returning a snapshot
   * the caller can use to revert on failure. The brief asks for optimistic
   * UX for status/priority/assignee/labels and a non-optimistic path for
   * delete (we wait for the API confirmation to drop tickets).
   */
  const applyOptimistic = (
    operation: BulkOperation,
    value: string | undefined,
  ): OptimisticSnapshot => {
    const snapshot = captureSnapshot();
    setTickets((prev) =>
      prev.map((t) => {
        if (!selection.selectedNumbers.has(t.number)) return t;
        if (operation === 'status' && value) {
          const column: StatusColumn | undefined = columns.find(
            (c) => c.id === value,
          );
          if (!column) return t;
          return {
            ...t,
            statusColumnId: column.id,
            statusColumn: column,
          };
        }
        if (operation === 'priority' && value) {
          return { ...t, priority: value as Priority };
        }
        if (operation === 'assignee') {
          if (value === UNASSIGNED_SENTINEL || value === undefined) {
            return { ...t, assigneeId: null, assignee: null };
          }
          const member = members.find((m) => m.userId === value);
          if (!member) return t;
          return { ...t, assigneeId: member.userId, assignee: member.user };
        }
        if (operation === 'addLabel' && value) {
          const label = labels.find((l) => l.id === value);
          if (!label) return t;
          if (t.labels.some((l) => l.id === label.id)) return t;
          return { ...t, labels: [...t.labels, label] };
        }
        if (operation === 'removeLabel' && value) {
          return {
            ...t,
            labels: t.labels.filter((l) => l.id !== value),
          };
        }
        return t;
      }),
    );
    return snapshot;
  };

  const revertSnapshot = (snapshot: OptimisticSnapshot) => {
    setTickets(() => snapshot.tickets);
  };

  const runOptimistic = async (
    operation: BulkOperation,
    value: string | undefined,
  ) => {
    // Guard: backend rejects the whole batch when any selected ticket lacks
    // an assignee and the target column is "In Progress". Mirror that here so
    // the UI does not show partial optimistic progress that will be rolled
    // back server-side.
    if (operation === 'status' && value) {
      const column = columns.find((c) => c.id === value);
      if (column && isInProgressColumnName(column.name)) {
        const unassignedCount = tickets.filter(
          (t) =>
            selection.selectedNumbers.has(t.number) && t.assigneeId === null,
        ).length;
        if (unassignedCount > 0) {
          toast.error(
            `${unassignedCount} ticket(s) must be assigned before they can move to In Progress`,
          );
          return;
        }
      }
    }

    const snapshot = applyOptimistic(operation, value);
    try {
      await bulkUpdate({
        ticketNumbers: selectedIds,
        operation,
        value,
      });
      toast.success(`${selectedIds.length} tickets updated`);
      selection.clearAll();
    } catch (err) {
      revertSnapshot(snapshot);
      toast.error(
        err instanceof Error ? err.message : 'Bulk update failed',
      );
    }
  };

  const runDelete = async () => {
    try {
      await bulkUpdate({
        ticketNumbers: selectedIds,
        operation: 'delete',
      });
      // Delete is non-optimistic: drop locally only after the API confirms,
      // matching the brief's explicit "wait for API confirmation".
      setTickets((prev) =>
        prev.filter((t) => !selection.selectedNumbers.has(t.number)),
      );
      toast.success(`${selectedIds.length} tickets deleted`);
      selection.clearAll();
      setDeleteOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Bulk delete failed',
      );
    }
  };

  return (
    <div
      data-testid="bulk-action-bar"
      className="fixed bottom-6 left-1/2 z-50 w-full max-w-3xl -translate-x-1/2 px-4"
    >
      <div
        className={cn(
          'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4',
          'flex items-center justify-between gap-4 rounded-card border border-trakk-border',
          'bg-trakk-surface px-4 py-3 shadow-glow',
          'duration-300 ease-ace-enter',
        )}
      >
        <div className="flex items-center gap-3">
          {loading && (
            <Loader2
              data-testid="bulk-bar-spinner"
              className="h-4 w-4 animate-spin text-trakk-text-secondary"
            />
          )}
          <span className="font-body text-[13px] text-trakk-text">
            {selection.count} tickets selected
          </span>
          <button
            type="button"
            onClick={selection.clearAll}
            className="font-body text-[12px] text-trakk-text-secondary underline-offset-2 hover:text-trakk-text hover:underline"
            data-testid="bulk-bar-clear"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Status */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'flex items-center gap-1.5 rounded-md border border-trakk-border px-2.5 py-1.5',
                'font-mono text-[10px] uppercase tracking-[2px] text-trakk-text-secondary',
                'transition-colors hover:border-trakk-teal hover:text-trakk-teal',
                loading && 'pointer-events-none opacity-50',
              )}
              data-testid="bulk-status-trigger"
            >
              Status <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {columns.map((c) => (
                <DropdownMenuItem
                  key={c.id}
                  onSelect={() => runOptimistic('status', c.id)}
                  data-testid={`bulk-status-option-${c.id}`}
                >
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Priority */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'flex items-center gap-1.5 rounded-md border border-trakk-border px-2.5 py-1.5',
                'font-mono text-[10px] uppercase tracking-[2px] text-trakk-text-secondary',
                'transition-colors hover:border-trakk-teal hover:text-trakk-teal',
                loading && 'pointer-events-none opacity-50',
              )}
              data-testid="bulk-priority-trigger"
            >
              Priority <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {PRIORITY_OPTIONS.map((p) => (
                <DropdownMenuItem
                  key={p.value}
                  onSelect={() => runOptimistic('priority', p.value)}
                  data-testid={`bulk-priority-option-${p.value}`}
                >
                  <span
                    className={cn('h-2 w-2 rounded-full', p.dotClass)}
                  />
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign */}
          <Popover
            trigger={
              <button
                type="button"
                disabled={loading}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border border-trakk-border px-2.5 py-1.5',
                  'font-mono text-[10px] uppercase tracking-[2px] text-trakk-text-secondary',
                  'transition-colors hover:border-trakk-teal hover:text-trakk-teal',
                  loading && 'pointer-events-none opacity-50',
                )}
                data-testid="bulk-assign-trigger"
              >
                <UserIcon className="h-3 w-3" /> Assign
                <ChevronDown className="h-3 w-3" />
              </button>
            }
          >
            <div className="flex flex-col gap-0.5" data-testid="bulk-assign-menu">
              <button
                type="button"
                onClick={() => runOptimistic('assignee', UNASSIGNED_SENTINEL)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left font-body text-[13px] text-trakk-text hover:bg-trakk-bg"
                data-testid="bulk-assign-unassign"
              >
                <span className="h-4 w-4 rounded-full border border-trakk-border bg-trakk-bg" />
                Unassign
              </button>
              <div className="my-1 h-px bg-trakk-border" />
              {members.map((m) => {
                const display = m.user.displayName || m.user.email;
                return (
                  <button
                    type="button"
                    key={m.userId}
                    onClick={() => runOptimistic('assignee', m.userId)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left font-body text-[13px] text-trakk-text hover:bg-trakk-bg"
                    data-testid={`bulk-assign-option-${m.userId}`}
                  >
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded-full bg-trakk-teal font-mono text-[9px] uppercase text-trakk-bg"
                    >
                      {display.charAt(0).toUpperCase()}
                    </span>
                    {display}
                  </button>
                );
              })}
            </div>
          </Popover>

          {/* Label */}
          <Popover
            trigger={
              <button
                type="button"
                disabled={loading}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border border-trakk-border px-2.5 py-1.5',
                  'font-mono text-[10px] uppercase tracking-[2px] text-trakk-text-secondary',
                  'transition-colors hover:border-trakk-teal hover:text-trakk-teal',
                  loading && 'pointer-events-none opacity-50',
                )}
                data-testid="bulk-label-trigger"
              >
                <TagIcon className="h-3 w-3" /> Label
                <ChevronDown className="h-3 w-3" />
              </button>
            }
          >
            <div className="flex w-[260px] flex-col gap-1" data-testid="bulk-label-menu">
              <div className="flex gap-1 border-b border-trakk-border pb-1">
                <button
                  type="button"
                  onClick={() => setLabelMode('addLabel')}
                  className={cn(
                    'rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[2px]',
                    labelMode === 'addLabel'
                      ? 'bg-trakk-teal text-trakk-bg'
                      : 'text-trakk-text-secondary hover:bg-trakk-bg',
                  )}
                  data-testid="bulk-label-tab-add"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setLabelMode('removeLabel')}
                  className={cn(
                    'rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[2px]',
                    labelMode === 'removeLabel'
                      ? 'bg-trakk-teal text-trakk-bg'
                      : 'text-trakk-text-secondary hover:bg-trakk-bg',
                  )}
                  data-testid="bulk-label-tab-remove"
                >
                  Remove
                </button>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {labels.map((l) => (
                  <button
                    type="button"
                    key={l.id}
                    onClick={() => runOptimistic(labelMode, l.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-body text-[13px] text-trakk-text hover:bg-trakk-bg"
                    data-testid={`bulk-label-option-${l.id}`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: l.color ?? '#888' }}
                    />
                    {l.name}
                  </button>
                ))}
                {labels.length === 0 && (
                  <p className="px-2 py-2 font-body text-[12px] text-trakk-text-secondary">
                    No labels available
                  </p>
                )}
              </div>
            </div>
          </Popover>

          <div className="h-6 w-px bg-trakk-border" />

          {/* Delete */}
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => setDeleteOpen(true)}
            className="font-mono text-[10px] uppercase tracking-[2px] text-status-error hover:text-status-error"
            data-testid="bulk-delete-trigger"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent data-testid="bulk-delete-dialog">
          <DialogHeader>
            <DialogTitle>{`Delete ${selection.count} tickets?`}</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <p className="font-body text-[13px] text-trakk-text-secondary">
            This permanently removes {selection.count} tickets from the project.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              data-testid="bulk-delete-cancel"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={runDelete}
              disabled={loading}
              data-testid="bulk-delete-confirm"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}