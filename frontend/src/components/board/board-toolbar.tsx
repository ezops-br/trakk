'use client';

import React from 'react';
import { Search, Check, X } from 'lucide-react';
import type { BoardFilters, MemberWithUser, LabelSummary, Priority } from '@/lib/types';
import { UNASSIGNED_SENTINEL } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover } from '@/components/ui/popover';
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
  onClearAll: () => void;
  isLoadingFilterData?: boolean;
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
  onClearAll,
  isLoadingFilterData = false,
}: BoardToolbarProps) {
  const { assigneeIds, priorities, labelIds, search } = filters;

  const hasActiveFilters =
    assigneeIds.length > 0 ||
    priorities.length > 0 ||
    labelIds.length > 0 ||
    search.length > 0;

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
