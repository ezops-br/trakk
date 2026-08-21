'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
  TicketDetail,
  TicketWithRelations,
  UpdateTicketInput,
  LabelSummary,
} from '@/lib/types';

export interface UseTicketDetailReturn {
  ticket: TicketDetail | null;
  loading: boolean;
  error: string | null;
  updateTicket: (input: UpdateTicketInput) => Promise<void>;
  addLabel: (labelId: string) => Promise<void>;
  removeLabel: (labelId: string) => Promise<void>;
  deleteTicketPermanently: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useTicketDetail(
  projectId: string,
  ticketNumber: string | number,
  enabled = true,
): UseTicketDetailReturn {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTicket = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const { ticket: data } = await apiClient.get<{ ticket: TicketDetail }>(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}`,
      );
      setTicket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [projectId, ticketNumber, enabled]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  const updateTicket = useCallback(
    async (input: UpdateTicketInput): Promise<void> => {
      const { ticket: updated } = await apiClient.patch<{
        ticket: TicketWithRelations;
      }>(`/api/v1/projects/${projectId}/tickets/${ticketNumber}`, input);
      setTicket((prev) =>
        prev ? { ...prev, ...updated, activityLog: prev.activityLog } : prev,
      );
    },
    [projectId, ticketNumber],
  );

  const addLabel = useCallback(
    async (labelId: string): Promise<void> => {
      const { ticket: updated } = await apiClient.post<{
        ticket: { id: string; labels: LabelSummary[] };
      }>(`/api/v1/projects/${projectId}/tickets/${ticketNumber}/labels`, {
        labelId,
      });
      setTicket((prev) =>
        prev ? { ...prev, labels: updated.labels } : prev,
      );
    },
    [projectId, ticketNumber],
  );

  const removeLabel = useCallback(
    async (labelId: string): Promise<void> => {
      const { ticket: updated } = await apiClient.del<{
        ticket: { id: string; labels: LabelSummary[] };
      }>(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}/labels/${labelId}`,
      );
      setTicket((prev) =>
        prev ? { ...prev, labels: updated.labels } : prev,
      );
    },
    [projectId, ticketNumber],
  );

  // Hard delete — removes the ticket and everything attached to it. Rejections
  // propagate so the caller can surface the error in its own UI.
  const deleteTicketPermanently = useCallback(async (): Promise<void> => {
    await apiClient.del(
      `/api/v1/projects/${projectId}/tickets/${ticketNumber}`,
    );
  }, [projectId, ticketNumber]);

  return {
    ticket,
    loading,
    error,
    updateTicket,
    addLabel,
    removeLabel,
    deleteTicketPermanently,
    refetch: fetchTicket,
  };
}
