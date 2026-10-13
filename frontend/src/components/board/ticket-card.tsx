'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  MoreHorizontal,
  User as UserIcon,
} from 'lucide-react';
import type { TicketWithRelations, Priority } from '@/lib/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  cn,
  formatRelativeTime,
  formatAbsoluteDateTime,
} from '@/lib/utils';

const PRIORITY_BORDER: Record<Priority, string> = {
  URGENT: 'border-t-red-500',
  HIGH: 'border-t-orange-500',
  MEDIUM: 'border-t-yellow-500',
  LOW: 'border-t-blue-500',
  NONE: 'border-t-trakk-border',
};

const PRIORITY_ICON: Record<Priority, React.ReactNode> = {
  URGENT: <AlertTriangle size={13} className="text-priority-urgent" />,
  HIGH: <ArrowUp size={13} className="text-priority-high" />,
  MEDIUM: <Minus size={13} className="text-priority-medium" />,
  LOW: <ArrowDown size={13} className="text-priority-low" />,
  NONE: <MoreHorizontal size={13} className="text-priority-none" />,
};

const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'None',
};

interface TicketCardProps {
  ticket: TicketWithRelations;
  projectKey: string;
  onClick: () => void;
  overlay?: boolean;
}

export function TicketCard({
  ticket,
  projectKey,
  onClick,
  overlay = false,
}: TicketCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ticket.id, disabled: overlay });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const ticketId = `${projectKey}-${ticket.number}`;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      onClick={onClick}
      role="listitem"
      className={cn(
        'group cursor-pointer rounded-card border border-trakk-border border-t-2 bg-trakk-surface',
        'px-4 py-3.5 shadow-card transition-all duration-200 ease-ace-enter',
        'hover:border-[var(--trakk-teal-border)] hover:shadow-glow-subtle',
        PRIORITY_BORDER[ticket.priority],
        overlay && 'scale-[1.02] shadow-glow opacity-90',
      )}
    >
      {/* Top row: ticket ID + drag handle */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-wider text-trakk-teal">
          {ticketId}
        </span>
        {!overlay && (
          <button
            type="button"
            aria-label="Drag to reorder"
            className="cursor-grab text-trakk-text-secondary opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Title */}
      <p className="mt-1.5 font-body font-semibold text-[15px] leading-snug text-trakk-text">
        {ticket.title}
      </p>

      {/* Labels */}
      {ticket.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ticket.labels.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center rounded-badge border px-2 py-0.5 font-mono text-[10px] tracking-[1px] uppercase"
              style={{
                color: label.color,
                borderColor: `${label.color}40`,
                backgroundColor: `${label.color}1A`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Footer: priority + relative-time tooltip + assignee */}
      {/* Layout choice: priority (left) | relative-time (center) | assignee (right).
          The relative-time label sits between the priority badge and the assignee
          avatar in the existing flex row (justify-between keeps the priority-left
          / assignee-right rhythm intact at the 300px column width, gap-2 ensures
          the relative-time label has breathing room from both neighbors). The
          trigger is a <span tabIndex={0}> (so it can be focused by keyboard
          users), styled with the same micro-label register as the priority
          badge and the drag handle. onClick stopPropagation matches the
          existing drag handle's pattern so clicking the time label does not
          open the ticket detail. */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[2px] uppercase text-trakk-text-secondary">
          {PRIORITY_ICON[ticket.priority]}
          {PRIORITY_LABEL[ticket.priority]}
        </span>
        <Tooltip>
          <TooltipTrigger>
            <span
              tabIndex={0}
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-[10px] tracking-[1px] text-trakk-text-secondary"
            >
              {formatRelativeTime(ticket.updatedAt)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {formatAbsoluteDateTime(ticket.updatedAt)}
          </TooltipContent>
        </Tooltip>
        {ticket.assignee ? (
          <Avatar className="h-6 w-6">
            {ticket.assignee.avatarUrl && (
              <AvatarImage
                src={ticket.assignee.avatarUrl}
                alt={ticket.assignee.displayName}
              />
            )}
            <AvatarFallback>
              {ticket.assignee.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-trakk-border text-trakk-text-secondary">
            <UserIcon size={12} />
          </span>
        )}
      </div>
    </div>
  );
}
