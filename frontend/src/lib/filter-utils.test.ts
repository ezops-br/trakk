import { describe, it, expect } from 'vitest';
import { applyBoardFilters } from '@/lib/filter-utils';
import type { TicketWithRelations } from '@/lib/types';
import { UNASSIGNED_SENTINEL } from '@/lib/types';

const BASE_TICKET: TicketWithRelations = {
  id: 'ticket-1',
  projectId: 'proj-1',
  number: 1,
  title: 'Fix the login bug',
  description: null,
  statusColumnId: 'col-1',
  priority: 'HIGH',
  assigneeId: 'user-1',
  reporterId: 'user-2',
  sortOrder: 0,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  assignee: { id: 'user-1', displayName: 'Alice', avatarUrl: null, email: 'alice@example.com' },
  reporter: { id: 'user-2', displayName: 'Bob', avatarUrl: null, email: 'bob@example.com' },
  statusColumn: { id: 'col-1', projectId: 'proj-1', name: 'To Do', position: 0, createdAt: '2024-01-01T00:00:00.000Z' },
  labels: [{ id: 'label-1', name: 'Bug', color: '#ff0000' }],
};

const EMPTY_FILTERS = {
  assigneeIds: [],
  priorities: [] as TicketWithRelations['priority'][],
  labelIds: [],
  search: '',
};

describe('applyBoardFilters', () => {
  it('returns all tickets when all filter arrays are empty and search is empty', () => {
    // Arrange
    const tickets = [BASE_TICKET, { ...BASE_TICKET, id: 'ticket-2', number: 2 }];

    // Act
    const result = applyBoardFilters(tickets, EMPTY_FILTERS);

    // Assert
    expect(result).toHaveLength(2);
  });

  it('filters by priority using OR logic within the array', () => {
    // Arrange
    const tickets = [
      { ...BASE_TICKET, id: 'ticket-1', priority: 'HIGH' as const },
      { ...BASE_TICKET, id: 'ticket-2', priority: 'LOW' as const },
      { ...BASE_TICKET, id: 'ticket-3', priority: 'URGENT' as const },
    ];
    const filters = { ...EMPTY_FILTERS, priorities: ['HIGH', 'LOW'] as TicketWithRelations['priority'][] };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(expect.arrayContaining(['ticket-1', 'ticket-2']));
    expect(result.find((t) => t.id === 'ticket-3')).toBeUndefined();
  });

  it('filters by assigneeId matching a specific user UUID', () => {
    // Arrange
    const tickets = [
      { ...BASE_TICKET, id: 'ticket-1', assigneeId: 'user-1' },
      { ...BASE_TICKET, id: 'ticket-2', assigneeId: 'user-2' },
      { ...BASE_TICKET, id: 'ticket-3', assigneeId: null },
    ];
    const filters = { ...EMPTY_FILTERS, assigneeIds: ['user-1'] };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ticket-1');
  });

  it('matches UNASSIGNED_SENTINEL to tickets with null assigneeId', () => {
    // Arrange
    const tickets = [
      { ...BASE_TICKET, id: 'ticket-1', assigneeId: 'user-1' },
      { ...BASE_TICKET, id: 'ticket-2', assigneeId: null },
    ];
    const filters = { ...EMPTY_FILTERS, assigneeIds: [UNASSIGNED_SENTINEL] };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ticket-2');
  });

  it('filters by labelId — ticket must have at least one matching label (OR within labels)', () => {
    // Arrange
    const tickets = [
      { ...BASE_TICKET, id: 'ticket-1', labels: [{ id: 'label-1', name: 'Bug', color: '#f00' }] },
      { ...BASE_TICKET, id: 'ticket-2', labels: [{ id: 'label-2', name: 'Feature', color: '#0f0' }] },
      { ...BASE_TICKET, id: 'ticket-3', labels: [] },
    ];
    const filters = { ...EMPTY_FILTERS, labelIds: ['label-1'] };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ticket-1');
  });

  it('applies AND logic across filter types — all active dimensions must pass', () => {
    // Arrange: two tickets that each satisfy only one dimension
    const tickets = [
      { ...BASE_TICKET, id: 'ticket-1', priority: 'HIGH' as const, assigneeId: 'user-1' },
      { ...BASE_TICKET, id: 'ticket-2', priority: 'LOW' as const, assigneeId: 'user-1' },
    ];
    // Filter requires HIGH priority AND assigned to user-1
    const filters = {
      ...EMPTY_FILTERS,
      priorities: ['HIGH'] as TicketWithRelations['priority'][],
      assigneeIds: ['user-1'],
    };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert — only ticket-1 passes both dimensions
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ticket-1');
  });

  it('filters by search — case-insensitive substring match on title', () => {
    // Arrange
    const tickets = [
      { ...BASE_TICKET, id: 'ticket-1', title: 'Fix the Login Bug' },
      { ...BASE_TICKET, id: 'ticket-2', title: 'Add dark mode' },
    ];
    const filters = { ...EMPTY_FILTERS, search: 'login' };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ticket-1');
  });

  it('treats whitespace-only search as no filter — returns all tickets', () => {
    // Arrange
    const tickets = [BASE_TICKET, { ...BASE_TICKET, id: 'ticket-2' }];
    const filters = { ...EMPTY_FILTERS, search: '   ' };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no tickets match the active filters', () => {
    // Arrange
    const tickets = [{ ...BASE_TICKET, priority: 'LOW' as const }];
    const filters = { ...EMPTY_FILTERS, priorities: ['URGENT'] as TicketWithRelations['priority'][] };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert
    expect(result).toHaveLength(0);
  });

  it('handles UNASSIGNED_SENTINEL combined with a real user UUID (OR logic within assignees)', () => {
    // Arrange
    const tickets = [
      { ...BASE_TICKET, id: 'ticket-1', assigneeId: 'user-1' },
      { ...BASE_TICKET, id: 'ticket-2', assigneeId: null },
      { ...BASE_TICKET, id: 'ticket-3', assigneeId: 'user-9' },
    ];
    const filters = { ...EMPTY_FILTERS, assigneeIds: [UNASSIGNED_SENTINEL, 'user-1'] };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert — matches unassigned + user-1, excludes user-9
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id)).toEqual(expect.arrayContaining(['ticket-1', 'ticket-2']));
  });

  it('trims search before matching', () => {
    // Arrange
    const tickets = [
      { ...BASE_TICKET, id: 'ticket-1', title: 'Fix the login bug' },
      { ...BASE_TICKET, id: 'ticket-2', title: 'Add dark mode' },
    ];
    const filters = { ...EMPTY_FILTERS, search: '  fix  ' };

    // Act
    const result = applyBoardFilters(tickets, filters);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ticket-1');
  });
});
