'use client';

import React from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { DashboardEmpty } from './DashboardEmpty';
import { applyTicketFilters, sortTickets } from '@/lib/dashboard-filter-utils';
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

export function DashboardMyTickets({ tickets, loading, filters, onNavigate }: Props) {
  const filtered = applyTicketFilters(tickets, filters);
  const sorted = sortTickets(
    filtered,
    filters.ticketSort ?? 'updatedAt',
    filters.ticketSortDir ?? 'DESC',
  );
  const displayed = sorted.slice(0, 10);

  return (
    <section className="rounded-card bg-trakk-surface border border-trakk-border shadow-card">
      <div className="px-5 py-4 border-b border-trakk-border flex items-center justify-between">
        <h2 className="font-display font-bold text-base text-trakk-text tracking-wide">
          My Tickets
        </h2>
        {!loading && tickets.length > 0 && (
          <span className="font-mono text-[10px] tracking-[2px] uppercase text-trakk-text-secondary">
            {tickets.length} total
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : displayed.length === 0 ? (
        <DashboardEmpty
          title="No tickets assigned to you"
          description="Tickets assigned to you across all projects appear here."
        />
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
