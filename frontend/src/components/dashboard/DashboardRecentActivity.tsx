'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardEmpty } from './DashboardEmpty';
import { applyActivityFilters } from '@/lib/dashboard-filter-utils';
import { formatRelativeTime } from '@/lib/utils';
import type { RawDashboardActivity, DashboardFilters } from '@/lib/types';

interface Props {
  activities: RawDashboardActivity[];
  loading: boolean;
  filters: DashboardFilters;
  onNavigate: (projectId: string, projectKey: string, ticketNumber: number) => void;
}

const ACTION_LABELS: Record<string, string> = {
  commented: 'commented on',
  status_changed: 'changed status on',
  priority_changed: 'changed priority on',
  title_changed: 'updated title of',
  assignee_changed: 'changed assignee on',
  label_assigned: 'added label to',
  label_removed: 'removed label from',
  meeting_scheduled: 'scheduled a meeting on',
  meeting_updated: 'updated meeting on',
  meeting_cancelled: 'cancelled meeting on',
  meet_started: 'started Quick Meet on',
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ') + ' on';
}

export function DashboardRecentActivity({ activities, loading, filters, onNavigate }: Props) {
  const filtered = applyActivityFilters(activities, filters);
  const displayed = filtered.slice(0, 20);

  return (
    <section className="rounded-card bg-trakk-surface border border-trakk-border shadow-card flex flex-col h-96">
      <div className="px-5 py-4 border-b border-trakk-border flex items-center justify-between shrink-0">
        <h2 className="font-display font-bold text-base text-trakk-text tracking-wide">
          Recent Activity
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
      {loading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : displayed.length === 0 ? (
        <DashboardEmpty
          title="No recent activity"
          description="Actions taken on your projects will appear here."
        />
      ) : (
        <ul className="divide-y divide-trakk-border">
          {displayed.map((activity) => (
            <li key={activity.id}>
              <button
                type="button"
                onClick={() => onNavigate(activity.ticket.projectId, activity.ticket.project.key, activity.ticket.number)}
                className="w-full text-left px-5 py-3 hover:bg-[var(--trakk-teal-hover)] transition-colors duration-150 flex items-start gap-2 group"
              >
                <span className="flex-1 min-w-0 font-body text-sm text-trakk-text leading-snug">
                  <span className="font-medium">{activity.user.displayName}</span>
                  {' '}
                  <span className="text-trakk-text-secondary">{getActionLabel(activity.action)}</span>
                  {' '}
                  <span className="font-mono text-[11px] text-trakk-teal">
                    {activity.ticket.project.key}-{activity.ticket.number}
                  </span>
                </span>
                <span className="shrink-0 font-body text-xs text-trakk-text-secondary mt-0.5">
                  {formatRelativeTime(activity.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
