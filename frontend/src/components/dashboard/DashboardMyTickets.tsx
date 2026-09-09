'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { DueDateBadge } from '@/components/tickets/DueDateBadge';
import { CalendarX2, CalendarCheck2 } from 'lucide-react';
import { DashboardEmpty } from './DashboardEmpty';
import {
  applyTicketFilters,
  sortTickets,
  matchesDueFilter,
  type DashboardDueFilter,
} from '@/lib/dashboard-filter-utils';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { RawDashboardTicket, DashboardFilters, Priority } from '@/lib/types';

interface Props {
  tickets: RawDashboardTicket[];
  loading: boolean;
  filters: DashboardFilters;
  onNavigate: (projectId: string, projectKey: string, ticketNumber: number) => void;
}

const PRIORITY_BADGE_VARIANT: Record<Priority, 'urgent' | 'high' | 'medium' | 'low' | 'neutral'> = {
  URGENT: 'urgent',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  NONE: 'neutral',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'None',
};

const DUE_PILLS: ReadonlyArray<{ id: DashboardDueFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'this_week', label: 'Due this week' },
];

const DUE_FILTER_EMPTY: Record<
  Exclude<DashboardDueFilter, 'all'>,
  { icon: React.ReactNode; title: string }
> = {
  overdue: {
    icon: <CalendarX2 size={28} aria-hidden="true" />,
    title: 'No tickets overdue',
  },
  today: {
    icon: <CalendarCheck2 size={28} aria-hidden="true" />,
    title: 'No tickets due today',
  },
  this_week: {
    icon: <CalendarCheck2 size={28} aria-hidden="true" />,
    title: 'No tickets due this week',
  },
};

export function DashboardMyTickets({ tickets, loading, filters, onNavigate }: Props) {
  const [dueFilter, setDueFilter] = useState<DashboardDueFilter>('all');

  // Pipeline: priority/status filters → due-date pill filter → sort → slice.
  const priorityFiltered = applyTicketFilters(tickets, filters);
  const dueFiltered = priorityFiltered.filter((t) => matchesDueFilter(t, dueFilter));
  const sorted = sortTickets(
    dueFiltered,
    filters.ticketSort ?? 'updatedAt',
    filters.ticketSortDir ?? 'DESC',
  );
  const displayed = sorted.slice(0, 10);

  return (
    <section className="rounded-card bg-trakk-surface border border-trakk-border shadow-card">
      <div className="px-5 py-4 border-b border-trakk-border">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-base text-trakk-text tracking-wide">
            My Tickets
          </h2>
          {!loading && tickets.length > 0 && (
            <span className="font-mono text-[10px] tracking-[2px] uppercase text-trakk-text-secondary">
              {tickets.length} total
            </span>
          )}
        </div>
        <div
          role="tablist"
          aria-label="Filter tickets by due date"
          className="mt-3 flex flex-wrap gap-2"
        >
          {DUE_PILLS.map((pill) => {
            const isActive = dueFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setDueFilter(pill.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-mono uppercase tracking-wide border transition-colors duration-150',
                  isActive
                    ? 'bg-trakk-teal-hover border-trakk-teal-border text-trakk-teal'
                    : 'bg-trakk-surface-alt border-trakk-border text-trakk-text-secondary hover:bg-trakk-teal-hover hover:border-trakk-teal-border hover:text-trakk-teal',
                )}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : displayed.length === 0 ? (
        tickets.length === 0 || dueFilter === 'all' ? (
          <DashboardEmpty
            title="No tickets assigned to you"
            description="Tickets assigned to you across all projects appear here."
          />
        ) : (
          <DashboardEmpty
            icon={DUE_FILTER_EMPTY[dueFilter].icon}
            title={DUE_FILTER_EMPTY[dueFilter].title}
          />
        )
      ) : (
        <ul className="divide-y divide-trakk-border">
          {displayed.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                onClick={() => onNavigate(ticket.projectId, ticket.project.key, ticket.number)}
                className="w-full text-left px-5 py-3 hover:bg-[var(--trakk-teal-hover)] transition-colors duration-150 flex items-center gap-3 group"
              >
                <span className="font-mono text-[11px] tracking-[1px] text-trakk-teal shrink-0">
                  {ticket.project.key}-{ticket.number}
                </span>
                <span className="flex-1 min-w-0 font-body text-sm text-trakk-text truncate group-hover:text-trakk-text">
                  {ticket.title}
                </span>
                <DueDateBadge dueDate={ticket.dueDate} compact />
                <Badge
                  variant={PRIORITY_BADGE_VARIANT[ticket.priority]}
                  className="shrink-0 text-[9px] px-2 py-0.5"
                >
                  {PRIORITY_LABEL[ticket.priority]}
                </Badge>
                <span className="shrink-0 font-body text-xs text-trakk-text-secondary truncate max-w-[80px]">
                  {ticket.statusColumn.name}
                </span>
                <span className="shrink-0 font-body text-xs text-trakk-text-secondary">
                  {formatRelativeTime(ticket.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
