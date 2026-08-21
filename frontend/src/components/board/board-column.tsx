'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { StatusColumn, TicketWithRelations } from '@/lib/types';
import { TicketCard } from './ticket-card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const COLUMN_COLOR_MAP: Record<string, string> = {
  'to do': 'bg-foreground/40',
  'in progress': 'bg-teal-500',
  'in review': 'bg-blue-500',
  done: 'bg-green-500',
};

function dotColor(name: string): string {
  return COLUMN_COLOR_MAP[name.trim().toLowerCase()] ?? 'bg-trakk-text-secondary';
}

interface BoardColumnProps {
  column: StatusColumn;
  tickets: TicketWithRelations[];
  projectKey: string;
  userRole: string;
  onAddTicket: (columnId: string) => void;
  onTicketClick: (ticketNumber: number) => void;
  totalCount: number;
  hasActiveFilters: boolean;
}

export function BoardColumn({
  column,
  tickets,
  projectKey,
  userRole,
  onAddTicket,
  onTicketClick,
  totalCount,
  hasActiveFilters,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const canEdit = userRole !== 'VIEWER';

  return (
    <div
      role="list"
      aria-label={column.name}
      className="flex w-[300px] shrink-0 flex-col rounded-panel bg-trakk-bg p-3"
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={cn('h-2 w-2 rounded-full', dotColor(column.name))} />
        <h3 className="font-display font-bold text-[23px] -tracking-wide text-trakk-text">
          {column.name}
        </h3>
        <span className="font-mono text-[10px] tracking-[2px] text-trakk-text-secondary">
          {hasActiveFilters ? `${tickets.length} of ${totalCount}` : String(totalCount)}
        </span>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={() => onAddTicket(column.id)}
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-trakk-border py-2 font-mono text-[10px] uppercase tracking-[2px] text-trakk-text-secondary transition-colors hover:border-trakk-teal hover:text-trakk-teal"
        >
          <Plus size={14} strokeWidth={1.75} />
          Add ticket
        </button>
      )}

      <ScrollArea
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-md transition-colors',
          'max-h-[calc(100vh-220px)]',
          isOver && 'border-2 border-dashed border-trakk-teal',
        )}
      >
        <SortableContext
          items={tickets.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2.5 p-0.5">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                projectKey={projectKey}
                onClick={() => onTicketClick(ticket.number)}
              />
            ))}
            {tickets.length === 0 && (
              <p className="px-1 py-4 text-center font-body text-[13px] text-trakk-text-secondary">
                No tickets
              </p>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}
