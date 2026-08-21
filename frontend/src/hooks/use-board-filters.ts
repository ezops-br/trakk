import { useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { Priority, BoardFilters } from '@/lib/types';
import { UNASSIGNED_SENTINEL } from '@/lib/types';

const VALID_PRIORITIES = new Set<string>(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']);
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidAssigneeId(value: string): boolean {
  return value === UNASSIGNED_SENTINEL || UUID_V4_RE.test(value);
}

function isValidLabelId(value: string): boolean {
  return UUID_V4_RE.test(value);
}

function parseCommaSeparated(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').filter((s) => s.trim().length > 0);
}

export interface UseBoardFiltersReturn {
  filters: BoardFilters;
  setAssigneeIds: (ids: string[]) => void;
  setPriorities: (priorities: Priority[]) => void;
  setLabelIds: (ids: string[]) => void;
  setSearch: (text: string) => void;
  clearAll: () => void;
  hasActiveFilters: boolean;
}

export function useBoardFilters(): UseBoardFiltersReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Extract raw param strings first so useMemo deps are stable primitives.
  const rawAssignee = searchParams.get('assignee');
  const rawPriority = searchParams.get('priority');
  const rawLabel = searchParams.get('label');
  const rawSearch = searchParams.get('search');

  // Parse assignee IDs: keep UNASSIGNED_SENTINEL or valid UUID v4 values.
  const assigneeIds = useMemo(
    () => parseCommaSeparated(rawAssignee).filter(isValidAssigneeId),
    [rawAssignee],
  );

  // Parse priorities: keep only valid Priority values.
  const priorities = useMemo(
    () => parseCommaSeparated(rawPriority).filter((p) => VALID_PRIORITIES.has(p)) as Priority[],
    [rawPriority],
  );

  // Parse label IDs: keep valid UUID v4 values.
  const labelIds = useMemo(
    () => parseCommaSeparated(rawLabel).filter(isValidLabelId),
    [rawLabel],
  );

  // Parse search: null or whitespace-only → ''.
  const search = useMemo(() => {
    const raw = rawSearch ?? '';
    return raw.trim().length === 0 ? '' : raw;
  }, [rawSearch]);

  // Stabilize the filters object via useMemo with joined string keys
  const filters = useMemo<BoardFilters>(
    () => ({ assigneeIds, priorities, labelIds, search }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assigneeIds.join(','), priorities.join(','), labelIds.join(','), search],
  );

  const hasActiveFilters =
    assigneeIds.length > 0 ||
    priorities.length > 0 ||
    labelIds.length > 0 ||
    search.length > 0;

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setAssigneeIds = useCallback(
    (ids: string[]) => {
      updateParam('assignee', ids.length > 0 ? ids.join(',') : null);
    },
    [updateParam],
  );

  const setPriorities = useCallback(
    (newPriorities: Priority[]) => {
      updateParam('priority', newPriorities.length > 0 ? newPriorities.join(',') : null);
    },
    [updateParam],
  );

  const setLabelIds = useCallback(
    (ids: string[]) => {
      updateParam('label', ids.length > 0 ? ids.join(',') : null);
    },
    [updateParam],
  );

  const setSearch = useCallback(
    (text: string) => {
      updateParam('search', text.trim().length > 0 ? text : null);
    },
    [updateParam],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('assignee');
    next.delete('priority');
    next.delete('label');
    next.delete('search');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  return {
    filters,
    setAssigneeIds,
    setPriorities,
    setLabelIds,
    setSearch,
    clearAll,
    hasActiveFilters,
  };
}
