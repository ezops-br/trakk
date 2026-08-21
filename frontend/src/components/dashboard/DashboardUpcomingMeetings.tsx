'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardEmpty } from './DashboardEmpty';
import { formatRelativeTime } from '@/lib/utils';
import type { RawDashboardMeeting } from '@/lib/types';

interface Props {
  meetings: RawDashboardMeeting[];
  loading: boolean;
  onNavigate: (projectId: string, projectKey: string, ticketNumber: number) => void;
}

function formatMeetingTime(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function DashboardUpcomingMeetings({ meetings, loading, onNavigate }: Props) {
  const now = new Date();
  const upcoming = meetings
    .filter((m) => new Date(m.endTime) > now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 10);

  return (
    <section className="rounded-card bg-trakk-surface border border-trakk-border shadow-card flex flex-col h-96">
      <div className="px-5 py-4 border-b border-trakk-border flex items-center justify-between shrink-0">
        <h2 className="font-display font-bold text-base text-trakk-text tracking-wide">
          Upcoming Meetings
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
      {loading ? (
        <div className="p-4 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : upcoming.length === 0 ? (
        <DashboardEmpty
          title="No upcoming meetings"
          description="Scheduled meetings across your projects will appear here."
        />
      ) : (
        <ul className="divide-y divide-trakk-border">
          {upcoming.map((meeting) => (
            <li key={meeting.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate(meeting.ticket.projectId, meeting.ticket.project.key, meeting.ticket.number)
                    }
                    className="text-left group"
                  >
                    <p className="font-body text-sm font-medium text-trakk-text truncate group-hover:text-trakk-teal transition-colors">
                      {meeting.title}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="font-mono text-[11px] text-trakk-teal">
                      {meeting.ticket.project.key}-{meeting.ticket.number}
                    </span>
                    <span className="font-body text-xs text-trakk-text-secondary">
                      {formatMeetingTime(meeting.startTime)}
                    </span>
                    <span className="font-body text-xs text-trakk-text-secondary">
                      by {meeting.organizer.displayName}
                    </span>
                  </div>
                </div>
                <a
                  href={meeting.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center px-3 py-1 rounded-badge bg-[var(--trakk-teal-bg)] border border-[var(--trakk-teal-border)] text-trakk-teal font-mono text-[10px] tracking-[1px] uppercase hover:bg-[var(--trakk-teal-border)] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Join
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
