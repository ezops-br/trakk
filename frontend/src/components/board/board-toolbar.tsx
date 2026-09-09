'use client';

import React from 'react';
import { Search, Check, X, ArrowUpDown, ArrowUp, ArrowDown, Calendar } from 'lucide-react';
import type { BoardFilters, MemberWithUser, LabelSummary, Priority, DueDateFilter } from '@/lib/types';
import { UNASSIGNED_SENTINEL } from '@/lib/types';
import {
  SORT_VALUES,
  SORT_LABEL,
  type SortKey,
} from '@/hooks/use-board-filters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const PRIORITY_VALUES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'None',
};

const PRIORITY_COLOR_CLASS: Record<Priority, string> = {
  URGENT: 'text-priority-urgent',
  HIGH: 'text-priority-high',
  MEDIUM: 'text-priority-medium',
  LOW: 'text-priority-low',
  NONE: 'text-trakk-text-secondary',
};

interface BoardToolbarProps {
  projectId: string;
  filters: BoardFilters;
  members: MemberWithUser[];
  labels: LabelSummary[];
  onAssigneeChange: (ids: string[]) => void;
  onPriorityChange: (priorities: Priority[]) => void;
  onLabelChange: (ids: string[]) => void;
  onSearchChange: (text: string) => void;
  onDueDateChange: (filter?: DueDateFilter, from?: string, to?: string) => void;
  onSortChange: (sort: SortKey) => void;
  onOrderChange: (order: 'asc' | 'desc') => void;
  sort: SortKey;
  order: 'asc' | 'desc';
  onClearAll: () => void;
  isLoadingFilterData?: boolean;
}

/**
 * Lightweight popover used by the Due date control.
 *
 * Unlike the shared <Popover primitive>, this variant lets the panel
 * close itself via the Apply button (by calling onApply(...)) without having
 * to climb back up to the trigger's state. The trigger toggles open/closed;
 * clicks inside the panel do not propagate to "outside".
 */
function DueDatePopover({
  triggerLabel,
  isActive,
  panelChildren,
}: {
  triggerLabel: string;
  isActive: boolean;
  panelChildren: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-label="Due date"
        aria-expanded={open}
        data-testid="board-toolbar-due-date-trigger"
        className={cn(
          'gap-2 rounded-pill',
          isActive && 'border-trakk-accent text-trakk-text',
        )}
      >
        <Calendar size={14} strokeWidth={1.75} />
        <span>{triggerLabel}</span>
      </Button>
      {open && (
        <div
          role="dialog"
          data-testid="board-toolbar-due-date-popover"
          className={cn(
            'absolute z-50 mt-2 min-w-[240px] rounded-panel border border-trakk-border',
            'bg-trakk-surface p-2 shadow-card left-0',
          )}
        >
          {panelChildren(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/**
 * Two date inputs (From / To) plus an Apply button. Apply is disabled when
 * both fields are empty or when From > To. A partial range (only From or only
 * To) is allowed — the backend handles missing bounds.
 */
function CustomRangeForm({
  initialFrom,
  initialTo,
  onApply,
}: {
  initialFrom?: string;
  initialTo?: string;
  onApply: (from: string | undefined, to: string | undefined) => void;
}) {
  const [from, setFrom] = React.useState<string>(initialFrom ?? '');
  const [to, setTo] = React.useState<string>(initialTo ?? '');

  // If the prop changes (e.g. URL re-sync), keep the inputs in sync.
  React.useEffect(() => {
    setFrom(initialFrom ?? '');
  }, [initialFrom]);
  React.useEffect(() => {
    setTo(initialTo ?? '');
  }, [initialTo]);

  const isInvalid = (from.length > 0 && to.length > 0 && from > to) || (from.length === 0 && to.length === 0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="font-mono text-[10px] tracking-[1px] text-trakk-text-secondary uppercase">From</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            data-testid="due-date-from"
            className="text-[12px] h-8"
          />
        </label>
        <label className="flex flex-col gap-0.5 flex-1">
          <span className="font-mono text-[10px] tracking-[1px] text-trakk-text-secondary uppercase">To</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            data-testid="due-date-to"
            className="text-[12px] h-8"
          />
        </label>
      </div>
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={isInvalid}
        data-testid="due-date-apply"
        onClick={() => onApply(from || undefined, to || undefined)}
        className="self-end"
      >
        Apply
      </Button>
    </div>
  );
}

function CheckboxRow({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-body text-trakk-text hover:bg-[var(--trakk-teal-hover)] transition-colors"
    >
      <div className="h-4 w-4 rounded border border-trakk-border flex items-center justify-center flex-shrink-0">
        {selected && <Check size={10} strokeWidth={2.5} className="text-trakk-teal" />}
      </div>
      {children}
    </button>
  );
}

function toggleValue<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function BoardToolbar({
  filters,
  members,
  labels,
  onAssigneeChange,
  onPriorityChange,
  onLabelChange,
  onSearchChange,
  onDueDateChange,
  onSortChange,
  onOrderChange,
  sort,
  order,
  onClearAll,
  isLoadingFilterData = false,
}: BoardToolbarProps) {
  const { assigneeIds, priorities, labelIds, search, dueDateFilter, dueDateFrom, dueDateTo } = filters;
  const hasDueDateFilter =
    dueDateFilter !== undefined || dueDateFrom !== undefined || dueDateTo !== undefined;

  const DUE_DATE_LABEL: Record<DueDateFilter, string> = {
    overdue: 'Overdue',
    today: 'Due today',
    this_week: 'Due this week',
    this_month: 'Due this month',
  };

  const dueDateTriggerLabel = dueDateFilter
    ? `Due date: ${DUE_DATE_LABEL[dueDateFilter]}`
    : dueDateFrom || dueDateTo
      ? `Due date: ${dueDateFrom ?? ''}${
          dueDateFrom || dueDateTo ? ' – ' : ''
        }${dueDateTo ?? ''}`
      : 'Due date';

  const hasActiveFilters =
    assigneeIds.length > 0 ||
    priorities.length > 0 ||
    labelIds.length > 0 ||
    search.length > 0 ||
    hasDueDateFilter;

  // Build display label for popover buttons
  const assigneeLabel =
    assigneeIds.length > 0 ? `Assignee (${assigneeIds.length})` : 'Assignee';
  const priorityLabel =
    priorities.length > 0 ? `Priority (${priorities.length})` : 'Priority';
  const labelsLabel =
    labelIds.length > 0 ? `Labels (${labelIds.length})` : 'Labels';

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      {/* Search input */}
      <div className="relative flex items-center">
        <Search
          size={14}
          strokeWidth={1.75}
          className="absolute left-3 text-trakk-text-secondary pointer-events-none"
        />
        <Input
          type="text"
          placeholder="Search tickets..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 py-1.5 text-[13px] h-9 w-52"
        />
      </div>

      {/* Assignee popover */}
      <Popover
        trigger={
          <Button
            variant="secondary"
            size="sm"
            disabled={isLoadingFilterData}
            aria-label="Assignee"
          >
            {assigneeLabel}
          </Button>
        }
      >
        <div className="flex flex-col min-w-[180px]">
          <CheckboxRow
            selected={assigneeIds.includes(UNASSIGNED_SENTINEL)}
            onClick={() =>
              onAssigneeChange(toggleValue(assigneeIds, UNASSIGNED_SENTINEL))
            }
          >
            <span className="text-trakk-text-secondary italic">Unassigned</span>
          </CheckboxRow>
          {members.map((member) => (
            <CheckboxRow
              key={member.user.id}
              selected={assigneeIds.includes(member.user.id)}
              onClick={() =>
                onAssigneeChange(toggleValue(assigneeIds, member.user.id))
              }
            >
              <span className="truncate">{member.user.displayName}</span>
            </CheckboxRow>
          ))}
        </div>
      </Popover>

      {/* Priority popover */}
      <Popover
        trigger={
          <Button variant="secondary" size="sm" aria-label="Priority">
            {priorityLabel}
          </Button>
        }
      >
        <div className="flex flex-col min-w-[160px]">
          {PRIORITY_VALUES.map((priority) => (
            <CheckboxRow
              key={priority}
              selected={priorities.includes(priority)}
              onClick={() => onPriorityChange(toggleValue(priorities, priority))}
            >
              <span className={cn('font-mono text-[11px] tracking-wider uppercase', PRIORITY_COLOR_CLASS[priority])}>
                {PRIORITY_LABEL[priority]}
              </span>
            </CheckboxRow>
          ))}
        </div>
      </Popover>

      {/* Labels popover */}
      <Popover
        trigger={
          <Button
            variant="secondary"
            size="sm"
            disabled={isLoadingFilterData || labels.length === 0}
            aria-label="Labels"
          >
            {labelsLabel}
          </Button>
        }
      >
        <div className="flex flex-col min-w-[180px]">
          {labels.map((label) => (
            <CheckboxRow
              key={label.id}
              selected={labelIds.includes(label.id)}
              onClick={() => onLabelChange(toggleValue(labelIds, label.id))}
            >
              <div
                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: label.color }}
              />
              <span className="truncate">{label.name}</span>
            </CheckboxRow>
          ))}
        </div>
      </Popover>

      {/* Due date popover */}
      <DueDatePopover
        triggerLabel={dueDateTriggerLabel}
        isActive={hasDueDateFilter}
        panelChildren={(close) => (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => {
                  onDueDateChange(); // All — clear all three
                  close();
                }}
                data-testid="due-date-option-all"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-body text-trakk-text hover:bg-[var(--trakk-teal-hover)] transition-colors',
                  !hasDueDateFilter && 'bg-[var(--trakk-teal-hover)]',
                )}
              >
                All
              </button>
              {(
                [
                  ['overdue', 'Overdue'],
                  ['today', 'Due today'],
                  ['this_week', 'Due this week'],
                  ['this_month', 'Due this month'],
                ] as Array<[DueDateFilter, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    onDueDateChange(value);
                    close();
                  }}
                  data-testid={`due-date-option-${value}`}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-body text-trakk-text hover:bg-[var(--trakk-teal-hover)] transition-colors',
                    dueDateFilter === value && 'bg-[var(--trakk-teal-hover)]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="h-px bg-trakk-border my-1" aria-hidden="true" />

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] tracking-[1px] text-trakk-text-secondary uppercase">
                Custom range
              </span>
              <CustomRangeForm
                initialFrom={dueDateFrom}
                initialTo={dueDateTo}
                onApply={(from, to) => {
                  onDueDateChange(undefined, from, to);
                  close();
                }}
              />
            </div>
          </div>
        )}
      />

      {/* Sort dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className={cn(
              'gap-2 rounded-pill',
              sort !== 'sortOrder' && 'border-trakk-accent text-trakk-text',
            )}
            aria-label="Sort tickets"
            data-testid="board-toolbar-sort-trigger"
          >
            <ArrowUpDown size={14} strokeWidth={2} />
            <span>
              Sort:{' '}
              <span className="font-semibold">
                {sort === 'sortOrder' ? 'Manual order' : SORT_LABEL[sort]}
              </span>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          <DropdownMenuRadioGroup
            value={sort}
            onValueChange={(value) => onSortChange(value as SortKey)}
          >
            {SORT_VALUES.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {SORT_LABEL[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Ascending / Descending toggle */}
      <Button
        variant="secondary"
        size="sm"
        className={cn(
          'gap-1.5 rounded-pill px-2.5',
          sort !== 'sortOrder' && 'border-trakk-accent text-trakk-text',
        )}
        onClick={() => onOrderChange(order === 'asc' ? 'desc' : 'asc')}
        disabled={sort === 'sortOrder'}
        aria-label={order === 'asc' ? 'Ascending order' : 'Descending order'}
        data-testid="board-toolbar-order-toggle"
      >
        {order === 'asc' ? (
          <ArrowUp size={14} strokeWidth={2} />
        ) : (
          <ArrowDown size={14} strokeWidth={2} />
        )}
        <span className="font-semibold">{order === 'asc' ? 'asc' : 'desc'}</span>
      </Button>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <>
          {/* Assignee badges */}
          {assigneeIds.map((id) => {
            if (id === UNASSIGNED_SENTINEL) {
              return (
                <ActiveBadge
                  key={UNASSIGNED_SENTINEL}
                  label="Unassigned"
                  ariaLabel="Remove Unassigned"
                  onRemove={() =>
                    onAssigneeChange(assigneeIds.filter((v) => v !== UNASSIGNED_SENTINEL))
                  }
                />
              );
            }
            const member = members.find((m) => m.user.id === id);
            if (!member) return null; // stale ID — render nothing
            return (
              <ActiveBadge
                key={id}
                label={member.user.displayName}
                ariaLabel={`Remove ${member.user.displayName}`}
                onRemove={() =>
                  onAssigneeChange(assigneeIds.filter((v) => v !== id))
                }
              />
            );
          })}

          {/* Priority badges */}
          {priorities.map((priority) => (
            <ActiveBadge
              key={priority}
              label={PRIORITY_LABEL[priority]}
              ariaLabel={`Remove ${PRIORITY_LABEL[priority]}`}
              onRemove={() => onPriorityChange(priorities.filter((p) => p !== priority))}
            />
          ))}

          {/* Label badges */}
          {labelIds.map((id) => {
            const label = labels.find((l) => l.id === id);
            if (!label) return null; // stale ID — render nothing
            return (
              <ActiveBadge
                key={id}
                label={label.name}
                ariaLabel={`Remove ${label.name}`}
                onRemove={() => onLabelChange(labelIds.filter((v) => v !== id))}
              />
            );
          })}

          {/* Search badge */}
          {search.length > 0 && (
            <ActiveBadge
              label={`Search: ${search}`}
              ariaLabel="Remove search"
              onRemove={() => onSearchChange('')}
            />
          )}

          {/* Due date badges */}
          {dueDateFilter !== undefined && (
            <ActiveBadge
              label={`Due: ${DUE_DATE_LABEL[dueDateFilter]}`}
              ariaLabel={`Remove due-date filter ${DUE_DATE_LABEL[dueDateFilter]}`}
              onRemove={() => onDueDateChange()}
            />
          )}
          {dueDateFilter === undefined && (dueDateFrom !== undefined || dueDateTo !== undefined) && (
            <ActiveBadge
              label={`Due: ${dueDateFrom ?? '...'} – ${dueDateTo ?? '...'}`}
              ariaLabel="Remove custom due-date range"
              onRemove={() => onDueDateChange()}
            />
          )}

          {/* Clear all */}
          <button
            type="button"
            onClick={onClearAll}
            className="font-body text-[13px] text-trakk-teal hover:underline transition-colors ml-1"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  );
}

interface ActiveBadgeProps {
  label: string;
  ariaLabel: string;
  onRemove: () => void;
}

function ActiveBadge({ label, ariaLabel, onRemove }: ActiveBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-badge border border-trakk-border bg-[var(--trakk-neutral-bg)] px-2 py-0.5 font-mono text-[10px] tracking-[1px] text-trakk-text-strong uppercase">
      {label}
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={onRemove}
        className="ml-0.5 text-trakk-text-secondary hover:text-trakk-text transition-colors"
      >
        <X size={10} strokeWidth={2.5} />
      </button>
    </span>
  );
}
