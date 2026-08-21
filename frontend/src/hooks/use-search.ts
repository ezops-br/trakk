'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { SearchResults } from '@/lib/types';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 5;

interface UseSearchReturn {
  results: SearchResults | null;
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (q: string) => void;
  clear: () => void;
}

export function useSearch(): UseSearchReturn {
  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeSearch = useCallback(async (q: string) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    // Build the query string into the path so the q value is URL-encoded
    // (spaces become '+') directly in the request path.
    const params = new URLSearchParams({ q, limit: '20' });
    const path = `/api/v1/search?${params.toString()}`;

    try {
      const data = await apiClient.getWithSignal<SearchResults>(
        path,
        controller.signal,
      );
      setResults({
        tickets: data.tickets.slice(0, MAX_RESULTS),
        projects: data.projects.slice(0, MAX_RESULTS),
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults(null);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q);
      if (timerRef.current) clearTimeout(timerRef.current);

      const trimmed = q.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) {
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
        setResults(null);
        setLoading(false);
        setError(null);
        return;
      }

      timerRef.current = setTimeout(() => executeSearch(trimmed), DEBOUNCE_MS);
    },
    [executeSearch],
  );

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setQueryState('');
    setResults(null);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { results, loading, error, query, setQuery, clear };
}
