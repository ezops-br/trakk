'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type { MeetingWithOrganizer, ScheduleMeetingInput, UpdateMeetingInput } from '@/lib/types';

export function useMeetings(projectId: string, ticketNumber: number, enabled: boolean) {
  const [meetings, setMeetings] = useState<MeetingWithOrganizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const BASE = `/api/v1/projects/${projectId}/tickets/${ticketNumber}/meetings`;

  const fetchMeetings = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<{ meetings: MeetingWithOrganizer[]; nextCursor: string | null }>(BASE);
      setMeetings(data.meetings);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load meetings');
    } finally {
      setLoading(false);
    }
  }, [enabled, BASE]);

  useEffect(() => {
    if (enabled) {
      fetchMeetings();
    }
  }, [fetchMeetings, enabled]);

  const fetchNextPage = useCallback(async () => {
    if (!nextCursor) return;
    try {
      const data = await apiClient.get<{ meetings: MeetingWithOrganizer[]; nextCursor: string | null }>(
        `${BASE}?cursor=${nextCursor}`,
      );
      setMeetings((prev) => [...prev, ...data.meetings]);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more meetings');
    }
  }, [nextCursor, BASE]);

  const scheduleMeeting = useCallback(
    async (input: ScheduleMeetingInput) => {
      const data = await apiClient.post<{ meeting: MeetingWithOrganizer }>(BASE, {
        ...input,
        startTime: new Date(input.startTime).toISOString(),
        endTime: new Date(input.endTime).toISOString(),
      });
      // Upsert: SSE may have already added this meeting before the API response
      // returned. Replace if found, add if not, to handle both race orderings.
      setMeetings((prev) => {
        const exists = prev.some((m) => m.id === data.meeting.id);
        const next = exists
          ? prev.map((m) => (m.id === data.meeting.id ? data.meeting : m))
          : [...prev, data.meeting];
        return next.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      });
    },
    [BASE],
  );

  const updateMeeting = useCallback(
    async (meetingId: string, input: UpdateMeetingInput) => {
      const data = await apiClient.patch<{ meeting: MeetingWithOrganizer; warning?: string }>(
        `${BASE}/${meetingId}`,
        input,
      );
      setMeetings((prev) => prev.map((m) => (m.id === meetingId ? data.meeting : m)));
      return data;
    },
    [BASE],
  );

  const cancelMeeting = useCallback(
    async (meetingId: string) => {
      await apiClient.del(`${BASE}/${meetingId}`);
      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    },
    [BASE],
  );

  const startInstantMeeting = useCallback(async () => {
    const data = await apiClient.post<{ meeting: MeetingWithOrganizer }>(`${BASE}/instant`, {});
    // Same upsert pattern as scheduleMeeting — SSE may arrive before this returns.
    setMeetings((prev) => {
      const exists = prev.some((m) => m.id === data.meeting.id);
      const next = exists
        ? prev.map((m) => (m.id === data.meeting.id ? data.meeting : m))
        : [...prev, data.meeting];
      return next.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    });
    return data.meeting;
  }, [BASE]);

  return {
    meetings,
    loading,
    error,
    nextCursor,
    fetchNextPage,
    scheduleMeeting,
    updateMeeting,
    cancelMeeting,
    startInstantMeeting,
    refetch: fetchMeetings,
    setMeetings,
  };
}
