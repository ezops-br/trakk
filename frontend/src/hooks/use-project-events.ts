'use client';

import React from 'react';
import { useEffect, useRef } from 'react';
import type { BoardEvent } from '@/lib/types';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * Subscribe to the project's server-sent event stream and invoke `onEvent`
 * for each board mutation. EventSource auto-reconnects on transient errors.
 */
export function useProjectEvents(
  projectId: string,
  onEvent: (event: BoardEvent) => void,
  enabled: boolean = true,
): void {
  // Keep the latest callback in a ref so we don't re-open the stream when the
  // handler identity changes between renders.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !projectId) return;
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    const url = `${API_ORIGIN}/api/v1/projects/${projectId}/events`;
    const source = new EventSource(url, { withCredentials: true });

    const handleMessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as BoardEvent;
        onEventRef.current(parsed);
      } catch {
        // Ignore malformed payloads — the stream will continue.
      }
    };

    source.onmessage = handleMessage;
    source.onerror = () => {
      // EventSource reconnects automatically; log for visibility.
      // eslint-disable-next-line no-console
      console.warn(`SSE connection error for project ${projectId}`);
    };

    return () => {
      source.close();
    };
  }, [projectId, enabled]);
}

// Referenced so the explicit React import is not flagged as unused under the
// classic JSX runtime used by the Vitest/jsdom test environment.
void React;
