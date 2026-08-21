"use client";

import React from 'react';
import Link from 'next/link';
import { isAllDay, isProximate } from '@/hooks/use-calendar';
import type { CalendarEvent } from '@/lib/types';

interface EventCardProps {
  event: CalendarEvent;
  now: Date;
}

function formatTime(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoString));
}

export function EventCard({ event, now }: EventCardProps) {
  const allDay = isAllDay(event);
  const proximate = !allDay && isProximate(event, now);

  return (
    <div className="px-4 py-3 rounded-lg bg-trakk-surface border border-trakk-border hover:border-trakk-accent/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-trakk-text leading-snug">
          {event.summary ?? 'No title'}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {event.isTrakkEvent && (
            event.trakkTicketId && event.trakkProjectId ? (
              <Link
                href={`/projects/${event.trakkProjectId}`}
                aria-label="Trakk"
                className="text-xs px-1.5 py-0.5 rounded bg-trakk-accent/10 text-trakk-accent font-medium hover:bg-trakk-accent/20 transition-colors"
              >
                Trakk
              </Link>
            ) : event.trakkTicketId ? (
              <Link
                href={`/tickets/${event.trakkTicketId}`}
                aria-label="Trakk"
                className="text-xs px-1.5 py-0.5 rounded bg-trakk-accent/10 text-trakk-accent font-medium hover:bg-trakk-accent/20 transition-colors"
              >
                Trakk
              </Link>
            ) : (
              <span
                aria-label="Trakk"
                className="text-xs px-1.5 py-0.5 rounded bg-trakk-accent/10 text-trakk-accent font-medium"
              >
                Trakk
              </span>
            )
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2 flex-wrap">
        {allDay ? (
          <span className="text-xs text-trakk-text-muted">All day</span>
        ) : (
          <span className="text-xs text-trakk-text-muted">
            {formatTime(event.start)} &ndash; {formatTime(event.end)}
          </span>
        )}

        {proximate && (
          <span
            data-proximate="true"
            className="text-xs font-medium text-amber-500"
          >
            Starting soon
          </span>
        )}
      </div>

      {event.meetLink && (
        <div className="mt-2">
          <a
            href={event.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join Meet"
            className="text-xs text-trakk-accent hover:underline font-medium"
          >
            Join Meet
          </a>
        </div>
      )}
    </div>
  );
}
