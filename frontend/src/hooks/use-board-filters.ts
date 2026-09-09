import { useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { Priority, BoardFilters, DueDateFilter } from '@/lib/types';
import { UNASSIGNED_SENTINEL } from '@/lib/types';

const VALID_PRIORITIES = new Set<string>(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']);
const VALID_DUE_DATE_FILTERS: ReadonlySet<string> = new Set<DueDateFilter>([
  'overdue',
  'today',
  'this_week',
  'this_month',
]);
// YYYY-MM-DD (input type="date" native format); partial ranges are allowed.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SORT_VALUES = [
  'sortOrder',
  'priority',
  'dueDate',
  'createdAt',
  'updatedAt',
  'number',
  'assignee',
] as const;

export type SortKey = (typeof SORT_VALUES)[number];

export const SORT_LABEL: Record<SortKey, string> = {
  sortOrder: 'Manual order',
  priority: 'Priority',
  dueDate: 'Due date',
  createdAt: 'Created date',
  updatedAt: 'Updated date',
  number: 'Ticket number',
  assignee: 'Assignee',
};

function parseSort(raw: string | null): SortKey {
  if (raw && (SORT_VALUES as readonly string[]).includes(raw)) {
    return raw as SortKey;
  }
  return 'sortOrder';
}

function parseOrder(raw: string | null): 'asc' | 'desc' {
  return raw === 'desc' ? 'desc' : 'asc';
}

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
  /**
   * Due-date setter covering all three related fields in one call.
   *  - setDueDateFilter()                        → clear all three
   *  - setDueDateFilter('overdue' | ...)         → set the convenience enum, clear from/to
   *  - setDueDateFilter(undefined, from, to)     → set custom range, clear the enum
   */
  setDueDateFilter: (filter?: DueDateFilter, from?: string, to?: string) => void;
  sort: SortKey;
  setSort: (sort: SortKey) => void;
  order: 'asc' | 'desc';
  setOrder: (order: 'asc' | 'desc') => void;
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
  const rawSort = searchParams.get('sort');
  const rawOrder = searchParams.get('order');
  const rawDueDateFilter = searchParams.get('dueDateFilter');
  const rawDueDateFrom = searchParams.get('dueDateFrom');
  const rawDueDateTo = searchParams.get('dueDateTo');

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

  // Parse due-date fields.
  //  - Unknown enum values (e.g. ?dueDateFilter=foo) are silently ignored.
  //  - Non-ISO date strings are ignored (defensive; the only writer is us).
  //  - Convenience enum and custom range are mutually exclusive in state:
  //    the enum is only restored when its raw value is valid, and any non-
  //    empty custom range clears it (mirrors the setter semantics).
  const dueDateFilter = useMemo<DueDateFilter | undefined>(() => {
    if (!rawDueDateFilter || !VALID_DUE_DATE_FILTERS.has(rawDueDateFilter as DueDateFilter)) {
      return undefined;
    }
    if (rawDueDateFrom || rawDueDateTo) return undefined;
    return rawDueDateFilter as DueDateFilter;
  }, [rawDueDateFilter, rawDueDateFrom, rawDueDateTo]);

  const dueDateFrom = useMemo<string | undefined>(() => {
    if (!rawDueDateFrom || !ISO_DATE_RE.test(rawDueDateFrom)) return undefined;
    if (rawDueDateFilter) return undefined;
    return rawDueDateFrom;
  }, [rawDueDateFilter, rawDueDateFrom]);

  const dueDateTo = useMemo<string | undefined>(() => {
    if (!rawDueDateTo || !ISO_DATE_RE.test(rawDueDateTo)) return undefined;
    if (rawDueDateFilter) return undefined;
    return rawDueDateTo;
  }, [rawDueDateFilter, rawDueDateTo]);

  // Parse sort / order: keep only valid SortKey / order values.
  const sort = useMemo(() => parseSort(rawSort), [rawSort]);
  const order = useMemo(() => parseOrder(rawOrder), [rawOrder]);

  // Stabilize the filters object via useMemo with joined string keys
  // Stabilize the filters object via useMemo with joined / coerced string keys
  // so the reference is stable across renders that don't actually change values.
  const filters = useMemo<BoardFilters>(
    () => ({ assigneeIds, priorities, labelIds, search, dueDateFilter, dueDateFrom, dueDateTo }),
    /* eslint-disable react-hooks/exhaustive-deps */
    [
      assigneeIds.join(','),
      priorities.join(','),
      labelIds.join(','),
      search,
      dueDateFilter ?? '',
      dueDateFrom ?? '',
      dueDateTo ?? '',
    ],
    /* eslint-enable react-hooks/exhaustive-deps */
  );

  const hasActiveFilters =
    assigneeIds.length > 0 ||
    priorities.length > 0 ||
    labelIds.length > 0 ||
    search.length > 0 ||
    dueDateFilter !== undefined ||
    dueDateFrom !== undefined ||
    dueDateTo !== undefined ||
    sort !== 'sortOrder';

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

  const setSort = useCallback(
    (next: SortKey) => {
      updateParam('sort', next === 'sortOrder' ? null : next);
    },
    [updateParam],
  );

  const setOrder = useCallback(
    (next: 'asc' | 'desc') => {
      updateParam('order', next === 'asc' ? null : next);
    },
    [updateParam],
  );

  /**
   * setDueDateFilter covers all three related fields in one call.
   *  - setDueDateFilter()                    → clear all three
   *  - setDueDateFilter('overdue' | ...)     → set the convenience enum, clear from/to
   *  - setDueDateFilter(undefined, from, to) → set custom range, clear the enum
   *
   * Performs a single router.replace so the three URL keys update atomically
   * (no half-applied state in the URL).
   */
  const setDueDateFilter = useCallback(
    (filter?: DueDateFilter, from?: string, to?: string) => {
      const next = new URLSearchParams(searchParams.toString());
      // Mode 1: convenience enum (filter passed, no from/to).
      // Mode 2: custom range (from and/or to passed).
      // Mode 3: clear all (no args).
      const useEnum = filter !== undefined && from === undefined && to === undefined;
      const useCustom = from !== undefined || to !== undefined;

      if (useEnum) {
        next.set('dueDateFilter', filter!);
        next.delete('dueDateFrom');
        next.delete('dueDateTo');
      } else if (useCustom) {
        next.delete('dueDateFilter');
        if (from && from.length > 0) {
          next.set('dueDateFrom', from);
        } else {
          next.delete('dueDateFrom');
        }
        if (to && to.length > 0) {
          next.set('dueDateTo', to);
        } else {
          next.delete('dueDateTo');
        }
      } else {
        next.delete('dueDateFilter');
        next.delete('dueDateFrom');
        next.delete('dueDateTo');
      }

      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const clearAll = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('assignee');
    next.delete('priority');
    next.delete('label');
    next.delete('search');
    next.delete('sort');
    next.delete('order');
    next.delete('dueDateFilter');
    next.delete('dueDateFrom');
    next.delete('dueDateTo');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  return {
    filters,
    setAssigneeIds,
    setPriorities,
    setLabelIds,
    setSearch,
    setDueDateFilter,
    sort,
    setSort,
    order,
    setOrder,
    clearAll,
    hasActiveFilters,
  };
}
