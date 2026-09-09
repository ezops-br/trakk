'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { LinkType, LinkWithTicket } from '@/lib/types';

interface UseLinksResult {
  links: LinkWithTicket[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createLink: (input: { targetTicketNumber: number; type: LinkType }) => Promise<void>;
  deleteLink: (linkId: string) => Promise<void>;
}

interface LinkApiResponse {
  link?: LinkWithTicket;
  links?: LinkWithTicket[];
}

export function useLinks(
  projectId: string,
  ticketNumber: number,
  enabled: boolean = true,
): UseLinksResult {
  const [links, setLinks] = useState<LinkWithTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const listLinks = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.get<LinkApiResponse>(
        `/api/v1/projects/${projectId}/tickets/${ticketNumber}/links`,
      );
      setLinks(result.links ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load links';
      setError(message);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, ticketNumber]);

  useEffect(() => {
    if (enabled) {
      void listLinks();
    } else {
      setLoading(false);
    }
  }, [enabled, listLinks]);

  const createLink = useCallback(
    async (input: { targetTicketNumber: number; type: LinkType }): Promise<void> => {
      try {
        await apiClient.post<LinkApiResponse>(
          `/api/v1/projects/${projectId}/tickets/${ticketNumber}/links`,
          input,
        );
        await listLinks();
      } catch (err) {
        await listLinks();
        throw err;
      }
    },
    [projectId, ticketNumber, listLinks],
  );

  const deleteLink = useCallback(
    async (linkId: string): Promise<void> => {
      try {
        await apiClient.del<void>(
          `/api/v1/projects/${projectId}/tickets/${ticketNumber}/links/${linkId}`,
        );
        await listLinks();
      } catch (err) {
        await listLinks();
        throw err;
      }
    },
    [projectId, ticketNumber, listLinks],
  );

  return {
    links,
    loading,
    error,
    refetch: listLinks,
    createLink,
    deleteLink,
  };
}
