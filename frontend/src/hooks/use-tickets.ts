'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import type {
  TicketWithRelations,
  TicketFilters,
  CreateTicketInput,
  ReorderUpdate,
} from '@/lib/types';

export interface UseTicketsReturn {
  tickets: TicketWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  createTicket: (input: CreateTicketInput) => Promise<TicketWithRelations>;
  deleteTicket: (ticketNumber: number) => Promise<void>;
  archiveTicket: (ticketNumber: number) => Promise<void>;
  reorderTickets: (updates: ReorderUpdate[]) => Promise<void>;
  setTickets: React.Dispatch<React.SetStateAction<TicketWithRelations[]>>;
  refetch: () => Promise<void>;
}

interface TicketsEnvelope {
  tickets: TicketWithRelations[];
  total: number;
  page: number;
  pageSize: number;
}

function buildQuery(filters?: TicketFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', String(filters.page));
  if (filters.pageSize !== undefined)
    params.set('pageSize', String(filters.pageSize));
  if (filters.statusColumnId) params.set('statusColumnId', filters.statusColumnId);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.labelId) params.set('labelId', filters.labelId);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useTickets(
  projectId: string,
  filters?: TicketFilters,
): UseTicketsReturn {
  const [tickets, setTickets] = useState<TicketWithRelations[]>([]);
  const ticketsRef = useRef<TicketWithRelations[]>([]);
  ticketsRef.current = tickets;
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(filters?.page ?? 1);
  const [pageSize, setPageSize] = useState(filters?.pageSize ?? 50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Serialize filters so the effect only re-runs on a meaningful change.
  const query = useMemo(() => buildQuery(filters), [filters]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<TicketsEnvelope>(
        `/api/v1/projects/${projectId}/tickets${query}`,
      );
      setTickets(data.tickets);
      setTotal(data.total);
      setPage(data.page);
      setPageSize(data.pageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [projectId, query]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const createTicket = useCallback(
    async (input: CreateTicketInput): Promise<TicketWithRelations> => {
      const { ticket } = await apiClient.post<{ ticket: TicketWithRelations }>(
        `/api/v1/projects/${projectId}/tickets`,
        input,
      );
      setTickets((prev) =>
        prev.some((t) => t.id === ticket.id)
          ? prev.map((t) => (t.id === ticket.id ? ticket : t))
          : [...prev, ticket],
      );
      setTotal((prev) => prev + 1);
      return ticket;
    },
    [projectId],
  );

  const deleteTicket = useCallback(
    async (ticketNumber: number): Promise<void> => {
      await apiClient.del(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}`,
      );
      setTickets((prev) => prev.filter((t) => t.number !== ticketNumber));
      setTotal((prev) => Math.max(0, prev - 1));
    },
    [projectId],
  );

  // Soft delete: the ticket stays in the database with archivedAt set, but it
  // is removed from the board just like a hard delete would remove it.
  const archiveTicket = useCallback(
    async (ticketNumber: number): Promise<void> => {
      await apiClient.patch<{ ticket: TicketWithRelations }>(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}/archive`,
        { archive: true },
      );
      setTickets((prev) => prev.filter((t) => t.number !== ticketNumber));
      setTotal((prev) => Math.max(0, prev - 1));
    },
    [projectId],
  );

  const reorderTickets = useCallback(
    async (updates: ReorderUpdate[]): Promise<void> => {
      const updateMap = new Map(updates.map((u) => [u.ticketId, u]));
      // Capture snapshot synchronously before the optimistic update so the
      // revert in the catch block always sees the pre-mutation list, even
      // when React batches the state updates in test environments.
      const previous = ticketsRef.current;

      setTickets((prev) =>
        prev.map((t) => {
          const u = updateMap.get(t.id);
          if (!u) return t;
          return {
            ...t,
            sortOrder: u.sortOrder,
            statusColumnId: u.statusColumnId ?? t.statusColumnId,
          };
        }),
      );

      try {
        await apiClient.patch<{ updated: number }>(
          `/api/v1/projects/${projectId}/tickets/reorder`,
          { updates },
        );
      } catch (err) {
        setTickets(previous);
        throw err;
      }
    },
    [projectId],
  );

  return {
    tickets,
    total,
    page,
    pageSize,
    loading,
    error,
    createTicket,
    deleteTicket,
    archiveTicket,
    reorderTickets,
    setTickets,
    refetch: fetchTickets,
  };
}
