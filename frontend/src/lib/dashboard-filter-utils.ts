import type {
  RawDashboardTicket,
  RawDashboardActivity,
  RawDashboardProject,
  DashboardFilters,
  Priority,
  Role,
} from '@/lib/types';

const PRIORITY_ORDER: Record<Priority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NONE: 4,
};

export function applyTicketFilters(
  tickets: RawDashboardTicket[],
  filters: DashboardFilters,
): RawDashboardTicket[] {
  return tickets.filter((t) => {
    if (filters.ticketPriority?.length && !filters.ticketPriority.includes(t.priority)) {
      return false;
    }
    if (filters.ticketStatus?.length && !filters.ticketStatus.includes(t.statusColumn.name)) {
      return false;
    }
    return true;
  });
}

export function sortTickets(
  tickets: RawDashboardTicket[],
  by: 'updatedAt' | 'createdAt' | 'priority' = 'updatedAt',
  dir: 'ASC' | 'DESC' = 'DESC',
): RawDashboardTicket[] {
  const sorted = [...tickets].sort((a, b) => {
    if (by === 'priority') {
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    }
    const aTime = new Date(a.updatedAt).getTime();
    const bTime = new Date(b.updatedAt).getTime();
    return aTime - bTime;
  });
  return dir === 'DESC' ? sorted.reverse() : sorted;
}

export function applyActivityFilters(
  activities: RawDashboardActivity[],
  filters: DashboardFilters,
): RawDashboardActivity[] {
  return activities.filter((a) => {
    if (filters.activityAction?.length && !filters.activityAction.includes(a.action)) {
      return false;
    }
    return true;
  });
}

// Projects in the dashboard response include a `role` field.
// The projectRole filter compares against that field.
export function applyProjectFilters(
  projects: RawDashboardProject[],
  filters: DashboardFilters,
): RawDashboardProject[] {
  return projects.filter((p) => {
    if (filters.projectRole?.length && !filters.projectRole.includes(p.role as Role)) {
      return false;
    }
    return true;
  });
}

export function sortProjects(
  projects: RawDashboardProject[],
  by: 'updatedAt' | 'createdAt' | 'name' = 'updatedAt',
  dir: 'ASC' | 'DESC' = 'DESC',
): RawDashboardProject[] {
  const sorted = [...projects].sort((a, b) => {
    if (by === 'name') return a.name.localeCompare(b.name);
    const dateField = by === 'updatedAt' ? 'updatedAt' : 'createdAt';
    return new Date(a[dateField]).getTime() - new Date(b[dateField]).getTime();
  });
  return dir === 'DESC' ? sorted.reverse() : sorted;
}

// ─── Due-date pill filter ─────────────────────────────────────────────────────

export type DashboardDueFilter = 'all' | 'overdue' | 'today' | 'this_week';

/**
 * `matchesDueFilter` is a pure helper consumed by the dashboard My Tickets
 * pill row.  It uses UTC midnight day boundaries so the answer is
 * deterministic regardless of the local timezone, and because the wire
 * format of `dueDate` is already a UTC-midnight ISO string (see
 * `<DueDateBadge>` / Prisma `dueDate DateTime?`).
 *
 * Week starts on Monday (ISO 8601). `this_week` covers
 * `[now, next Monday 00:00 UTC)`.
 * `null` dueDate tickets only pass under the `'all'` filter.
 */
export function matchesDueFilter(
  ticket: { dueDate: string | null },
  filter: DashboardDueFilter,
  now: Date = new Date(),
): boolean {
  if (filter === 'all') return true;
  if (!ticket.dueDate) return false;

  const todayUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const todayMs = new Date(todayUtcMidnight).getTime();

  if (filter === 'overdue') {
    // Strictly before today's UTC midnight.
    const dueMs = Date.parse(ticket.dueDate);
    return dueMs < todayMs;
  }

  if (filter === 'today') {
    // `[today midnight UTC, tomorrow midnight UTC)` — boundary-inclusive
    // on the lower edge because the wire format is itself a midnight ISO.
    const dueMs = Date.parse(ticket.dueDate);
    return dueMs >= todayMs && dueMs < todayMs + 24 * 60 * 60 * 1000;
  }

  // 'this_week' — `[now, next Monday 00:00 UTC)`.
  // JavaScript getUTCDay: 0 = Sun, 1 = Mon, ... 6 = Sat.
  // Days until next Monday: 7 if Mon, (8 - day) % 7 (with 0 -> 7) otherwise.
  const nowMs = now.getTime();
  const day = now.getUTCDay();
  const daysUntilNextMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  const endOfWeekMs = todayMs + daysUntilNextMonday * 24 * 60 * 60 * 1000;
  const dueMs = Date.parse(ticket.dueDate);
  return dueMs >= nowMs && dueMs < endOfWeekMs;
}
