import type { TicketWithRelations, BoardFilters } from '@/lib/types';
import { UNASSIGNED_SENTINEL } from '@/lib/types';

/**
 * Applies all active board filters to a list of tickets.
 * AND logic across dimensions, OR logic within each dimension.
 * Returns all tickets unchanged when all filters are empty.
 */
export function applyBoardFilters(
  tickets: TicketWithRelations[],
  filters: BoardFilters,
): TicketWithRelations[] {
  const { assigneeIds, priorities, labelIds, search } = filters;
  const trimmedSearch = search.trim();

  const hasAssigneeFilter = assigneeIds.length > 0;
  const hasPriorityFilter = priorities.length > 0;
  const hasLabelFilter = labelIds.length > 0;
  const hasSearchFilter = trimmedSearch.length > 0;

  if (!hasAssigneeFilter && !hasPriorityFilter && !hasLabelFilter && !hasSearchFilter) {
    return tickets;
  }

  const assigneeSet = new Set(assigneeIds);
  const prioritySet = new Set(priorities);
  const labelSet = new Set(labelIds);
  const searchLower = trimmedSearch.toLowerCase();

  return tickets.filter((ticket) => {
    // Search: case-insensitive substring match on title
    if (hasSearchFilter && !ticket.title.toLowerCase().includes(searchLower)) {
      return false;
    }

    // Priority: ticket.priority must be in the set
    if (hasPriorityFilter && !prioritySet.has(ticket.priority)) {
      return false;
    }

    // Assignee: unassigned sentinel OR UUID match
    if (hasAssigneeFilter) {
      const matchesUnassigned =
        ticket.assigneeId === null && assigneeSet.has(UNASSIGNED_SENTINEL);
      const matchesUser =
        ticket.assigneeId !== null && assigneeSet.has(ticket.assigneeId);
      if (!matchesUnassigned && !matchesUser) {
        return false;
      }
    }

    // Labels: at least one label must match
    if (hasLabelFilter) {
      const hasMatchingLabel = ticket.labels.some((label) => labelSet.has(label.id));
      if (!hasMatchingLabel) {
        return false;
      }
    }

    return true;
  });
}
