import { describe, it, expect } from 'vitest';

// dashboard-filter-utils.ts does not exist yet — this import fails with
// "Cannot find module" until the implementation is created (Red Phase).
import {
  applyTicketFilters,
  sortTickets,
  applyActivityFilters,
  applyProjectFilters,
} from '@/lib/dashboard-filter-utils';

// Minimal local types for test data.
// The real types will live in dashboard-filter-utils.ts or types.ts once built.
interface MockTicket {
  id: string;
  title: string;
  priority: string;
  updatedAt: string;
  project: { key: string; name: string };
  statusColumn: { name: string };
}

interface MockActivity {
  id: string;
  action: string;
  createdAt: string;
  user: { displayName: string };
  ticket: { number: number; projectId: string; project: { key: string } };
}

interface MockProjectSummary {
  id: string;
  name: string;
  key: string;
  role: string;
  openCount: number;
  totalCount: number;
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const URGENT_TICKET: MockTicket = {
  id: 'ticket-1',
  title: 'Critical outage',
  priority: 'URGENT',
  updatedAt: '2026-06-14T10:00:00Z',
  project: { key: 'TRAKK', name: 'Trakk' },
  statusColumn: { name: 'In Progress' },
};

const HIGH_TICKET: MockTicket = {
  id: 'ticket-2',
  title: 'Fix login bug',
  priority: 'HIGH',
  updatedAt: '2026-06-13T09:00:00Z',
  project: { key: 'TRAKK', name: 'Trakk' },
  statusColumn: { name: 'To Do' },
};

const LOW_TICKET: MockTicket = {
  id: 'ticket-3',
  title: 'Update docs',
  priority: 'LOW',
  updatedAt: '2026-06-12T08:00:00Z',
  project: { key: 'DEMO', name: 'Demo' },
  statusColumn: { name: 'To Do' },
};

const COMMENTED_ACTIVITY: MockActivity = {
  id: 'activity-1',
  action: 'commented',
  createdAt: '2026-06-14T10:00:00Z',
  user: { displayName: 'Alice' },
  ticket: { number: 1, projectId: 'proj-1', project: { key: 'TRAKK' } },
};

const STATUS_ACTIVITY: MockActivity = {
  id: 'activity-2',
  action: 'status_changed',
  createdAt: '2026-06-14T09:00:00Z',
  user: { displayName: 'Bob' },
  ticket: { number: 2, projectId: 'proj-1', project: { key: 'TRAKK' } },
};

const OWNER_PROJECT: MockProjectSummary = {
  id: 'proj-1',
  name: 'Trakk',
  key: 'TRAKK',
  role: 'OWNER',
  openCount: 5,
  totalCount: 12,
};

const MEMBER_PROJECT: MockProjectSummary = {
  id: 'proj-2',
  name: 'Demo',
  key: 'DEMO',
  role: 'MEMBER',
  openCount: 2,
  totalCount: 4,
};

// ─── applyTicketFilters ───────────────────────────────────────────────────────

describe('applyTicketFilters', () => {
  it('filters by ticketPriority — only URGENT tickets pass when filter is ["URGENT"]', () => {
    // Arrange
    const tickets = [URGENT_TICKET, HIGH_TICKET, LOW_TICKET];

    // Act
    const result = applyTicketFilters(tickets as any[], { ticketPriority: ['URGENT'] });

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ticket-1');
  });

  it('returns all tickets when filters object is empty {}', () => {
    // Arrange
    const tickets = [URGENT_TICKET, HIGH_TICKET, LOW_TICKET];

    // Act
    const result = applyTicketFilters(tickets as any[], {});

    // Assert
    expect(result).toHaveLength(3);
  });
});

// ─── sortTickets ─────────────────────────────────────────────────────────────

describe('sortTickets', () => {
  it('sorts by updatedAt DESC — the newer ticket appears first', () => {
    // Arrange — LOW_TICKET has oldest updatedAt, URGENT_TICKET has newest
    const tickets = [LOW_TICKET, URGENT_TICKET, HIGH_TICKET];

    // Act
    const result = sortTickets(tickets as any[]);

    // Assert
    expect(result[0].id).toBe('ticket-1'); // updatedAt: 2026-06-14 (newest)
    expect(result[1].id).toBe('ticket-2'); // updatedAt: 2026-06-13
    expect(result[2].id).toBe('ticket-3'); // updatedAt: 2026-06-12 (oldest)
  });
});

// ─── applyActivityFilters ─────────────────────────────────────────────────────

describe('applyActivityFilters', () => {
  it('filters by activityAction — only matching action passes', () => {
    // Arrange
    const activities = [COMMENTED_ACTIVITY, STATUS_ACTIVITY];

    // Act
    const result = applyActivityFilters(activities as any[], { activityAction: ['commented'] });

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('activity-1');
  });
});

// ─── applyProjectFilters ──────────────────────────────────────────────────────

describe('applyProjectFilters', () => {
  it('filters by projectRole — only OWNER projects pass when filter is ["OWNER"]', () => {
    // Arrange
    const projects = [OWNER_PROJECT, MEMBER_PROJECT];

    // Act
    const result = applyProjectFilters(projects as any[], { projectRole: ['OWNER'] });

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('proj-1');
  });
});

// ─── matchesDueFilter ─────────────────────────────────────────────────────────

import { matchesDueFilter } from '@/lib/dashboard-filter-utils';

describe('matchesDueFilter', () => {
  // Pin a deterministic "now": Thursday 2026-06-11 12:00:00 UTC.
  // Thu = 4 in getUTCDay(). Next Monday = 2026-06-15.
  const NOW = new Date('2026-06-11T12:00:00Z');

  it("'all' returns true for a ticket with a dueDate", () => {
    const ticket = { dueDate: '2026-06-12T00:00:00.000Z' };
    expect(matchesDueFilter(ticket, 'all', NOW)).toBe(true);
  });

  it("'all' returns true for a ticket without a dueDate", () => {
    const ticket = { dueDate: null };
    expect(matchesDueFilter(ticket, 'all', NOW)).toBe(true);
  });

  it("'overdue' excludes tickets with a null dueDate", () => {
    const ticket = { dueDate: null };
    expect(matchesDueFilter(ticket, 'overdue', NOW)).toBe(false);
  });

  it("'overdue' returns true for a dueDate earlier than today's UTC midnight", () => {
    const ticket = { dueDate: '2026-06-10T23:59:59.000Z' };
    expect(matchesDueFilter(ticket, 'overdue', NOW)).toBe(true);
  });

  it("'overdue' returns false for a dueDate equal to today's UTC midnight", () => {
    const ticket = { dueDate: '2026-06-11T00:00:00.000Z' };
    expect(matchesDueFilter(ticket, 'overdue', NOW)).toBe(false);
  });

  it("'today' returns true at the lower boundary (today's UTC midnight)", () => {
    const ticket = { dueDate: '2026-06-11T00:00:00.000Z' };
    expect(matchesDueFilter(ticket, 'today', NOW)).toBe(true);
  });

  it("'today' returns false at the upper boundary (tomorrow's UTC midnight)", () => {
    const ticket = { dueDate: '2026-06-12T00:00:00.000Z' };
    expect(matchesDueFilter(ticket, 'today', NOW)).toBe(false);
  });

  it("'today' returns false for a dueDate 30 days in the future", () => {
    const ticket = { dueDate: '2026-07-11T00:00:00.000Z' };
    expect(matchesDueFilter(ticket, 'today', NOW)).toBe(false);
  });

  it("'this_week' matches a dueDate 3 days in the future", () => {
    // Sunday 2026-06-14 is 3 days after Thursday 2026-06-11 — within the week.
    const ticket = { dueDate: '2026-06-14T00:00:00.000Z' };
    expect(matchesDueFilter(ticket, 'this_week', NOW)).toBe(true);
  });

  it("'this_week' excludes a dueDate 30 days in the future", () => {
    const ticket = { dueDate: '2026-07-11T00:00:00.000Z' };
    expect(matchesDueFilter(ticket, 'this_week', NOW)).toBe(false);
  });

  it("'this_week' excludes a dueDate before 'now'", () => {
    // A dueDate earlier than the pinned NOW must not be included.
    const ticket = { dueDate: '2026-06-10T00:00:00.000Z' };
    expect(matchesDueFilter(ticket, 'this_week', NOW)).toBe(false);
  });
});
