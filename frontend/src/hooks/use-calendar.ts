'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import type { CalendarEvent, CalendarResponse } from '@/lib/types';

const CACHE_TTL_MS = 300_000; // 5 minutes

export function isAllDay(event: Pick<CalendarEvent, 'start'>): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(event.start);
}

export function isProximate(event: Pick<CalendarEvent, 'start'>, now: Date): boolean {
  if (isAllDay(event)) return false;
  const start = new Date(event.start).getTime();
  const nowMs = now.getTime();
  const diff = start - nowMs;
  // true if event hasn't started yet and starts within 15 min (boundary inclusive)
  return diff > 0 && diff <= 900_000;
}

export function offsetDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface CacheEntry {
  events: CalendarEvent[];
  timestamp: number;
}

export function useCalendar() {
  const [selectedDate, setSelectedDate] = useState<string>(todayString);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState<boolean>(false);
  const [needsReauth, setNeedsReauth] = useState<boolean>(false);

  const cache = useRef<Map<string, CacheEntry>>(new Map());
  const isInitialMount = useRef(true);

  const fetchForDate = useCallback(
    async (date: string, opts: { useCache: boolean; writeCache: boolean } = { useCache: true, writeCache: true }) => {
      const nowMs = Date.now();
      if (opts.useCache) {
        const cached = cache.current.get(date);
        if (cached && nowMs - cached.timestamp < CACHE_TTL_MS) {
          setEvents(cached.events);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.get<CalendarResponse>(
          `/api/v1/calendar/events?date=${date}`,
        );
        if (opts.writeCache) {
          cache.current.set(date, { events: data.events, timestamp: Date.now() });
        }
        setEvents(data.events);
        setCalendarConnected(data.calendarConnected);
        setNeedsReauth(data.needsReauth ?? false);
        if (data.error) {
          setError(data.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load calendar events');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Initial mount: skip cache read (always fresh on first load) but write to cache
      fetchForDate(selectedDate, { useCache: false, writeCache: true });
    } else {
      // Navigation: use cache (read + write)
      fetchForDate(selectedDate, { useCache: true, writeCache: true });
    }
  }, [selectedDate, fetchForDate]);

  const goToPrevDay = useCallback(() => {
    setSelectedDate((prev) => offsetDate(prev, -1));
  }, []);

  const goToNextDay = useCallback(() => {
    setSelectedDate((prev) => offsetDate(prev, 1));
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDate(todayString());
  }, []);

  const refetch = useCallback(() => {
    cache.current.delete(selectedDate);
    fetchForDate(selectedDate, { useCache: false, writeCache: true });
  }, [selectedDate, fetchForDate]);

  return {
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
  };
}
