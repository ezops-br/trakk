"use client";

import React from 'react';
import { useCalendar } from '@/hooks/use-calendar';
import { CalendarDateNav } from './CalendarDateNav';
import { EventCard } from './EventCard';
import { Skeleton } from '@/components/ui/skeleton';
import { todayString } from '@/hooks/use-calendar';
import type { CalendarEvent } from '@/lib/types';

export function CalendarSidebar() {
  const {
    events,
    loading,
    error,
    calendarConnected,
    needsReauth,
    selectedDate,
    goToPrevDay,
    goToNextDay,
    goToToday,
    refetch,
  } = useCalendar();

  const now = new Date();
  const today = todayString();

  const allDayEvents: CalendarEvent[] = events.filter(
    (e) => /^\d{4}-\d{2}-\d{2}$/.test(e.start),
  );
  const timedEvents: CalendarEvent[] = events.filter(
    (e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.start),
  );

  return (
    <aside className="w-80 shrink-0 h-full bg-trakk-surface border-l border-trakk-border flex flex-col overflow-hidden">
      <CalendarDateNav
        selectedDate={selectedDate}
        today={today}
        onPrev={goToPrevDay}
        onNext={goToNextDay}
        onToday={goToToday}
      />

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !calendarConnected && !needsReauth ? (
          <div className="p-4 flex flex-col items-center justify-center gap-2 text-center h-full">
            <p className="text-trakk-text-secondary text-sm">
              Connect your Google Calendar to see your schedule here.
            </p>
            <a
              href="/api/v1/auth/google"
              className="mt-2 inline-flex items-center text-sm text-trakk-teal hover:underline"
            >
              Connect Google Calendar
            </a>
          </div>
        ) : needsReauth ? (
          <div className="p-4 flex flex-col items-center justify-center gap-2 text-center h-full">
            <p className="text-trakk-text-secondary text-sm">
              Your Google Calendar connection has expired.
            </p>
            <a
              href="/api/v1/auth/google"
              className="mt-2 inline-flex items-center text-sm text-trakk-teal hover:underline"
            >
              Reconnect Google Calendar
            </a>
          </div>
        ) : error ? (
          <div className="p-4 flex flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={refetch}
              className="text-xs px-3 py-1.5 rounded bg-trakk-accent text-white hover:bg-trakk-accent/90 transition-colors font-medium"
            >
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="p-4 flex items-center justify-center h-full">
            <p className="text-sm text-trakk-text-muted">No events for this day</p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {allDayEvents.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-trakk-text-muted uppercase tracking-wide">
                  All day
                </p>
                {allDayEvents.map((event) => (
                  <EventCard key={event.id} event={event} now={now} />
                ))}
              </div>
            )}
            {timedEvents.length > 0 && (
              <div className="space-y-2">
                {timedEvents.map((event) => (
                  <EventCard key={event.id} event={event} now={now} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
