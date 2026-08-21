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
