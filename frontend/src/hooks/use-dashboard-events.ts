'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  RawDashboardTicket,
  RawDashboardActivity,
} from '@/lib/types';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface DashboardEventHandlers {
  onTicketCreated?: (ticket: RawDashboardTicket) => void;
  onTicketUpdated?: (ticket: RawDashboardTicket) => void;
  onTicketDeleted?: (ticketId: string) => void;
  onActivityCreated?: (activity: RawDashboardActivity) => void;
  onProjectArchived?: (projectId: string) => void;
  onProjectDeleted?: (projectId: string) => void;
}

export function useDashboardEvents(
  handlers: DashboardEventHandlers,
  enabled = true,
): { isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(true);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const source = new EventSource(
      `${API_ORIGIN}/api/v1/dashboard/events`,
      { withCredentials: true },
    );

    source.onmessage = (e: MessageEvent) => {
      try {
        const { type, payload } = JSON.parse(e.data as string) as {
          type: string;
          payload: Record<string, unknown>;
        };
        setIsConnected(true);

        if (type === 'ticket.created') {
          handlersRef.current.onTicketCreated?.(payload.ticket as RawDashboardTicket);
        } else if (type === 'ticket.updated') {
          handlersRef.current.onTicketUpdated?.(payload.ticket as RawDashboardTicket);
        } else if (type === 'ticket.deleted') {
          handlersRef.current.onTicketDeleted?.(payload.ticketId as string);
        } else if (type === 'activity_log.created') {
          handlersRef.current.onActivityCreated?.(payload.activityLog as RawDashboardActivity);
        } else if (type === 'project.archived') {
          handlersRef.current.onProjectArchived?.(payload.projectId as string);
        } else if (type === 'project.deleted') {
          handlersRef.current.onProjectDeleted?.(payload.projectId as string);
        }
      } catch {
        // ignore malformed messages
      }
    };

    source.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      source.close();
    };
  }, [enabled]);

  return { isConnected };
}
