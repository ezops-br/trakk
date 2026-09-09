// @ts-nocheck
// TDD Red Phase — dashboard.service.ts does not exist yet.
// All tests will fail with "Cannot find module" until implementation is added.

jest.mock('../lib/prisma', () => ({
  prisma: {
    projectMember: { findMany: jest.fn() },
    ticket: { findMany: jest.fn() },
    activityLog: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
  },
}));

import { prisma } from '../lib/prisma';
import { getDashboardData } from './dashboard.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = 'user-uuid-1';
const PROJECT_ID_1 = 'proj-uuid-1';
const PROJECT_ID_2 = 'proj-uuid-2';

const MOCK_TICKET = {
  id: 'ticket-uuid-1',
  projectId: PROJECT_ID_1,
  number: 1,
  title: 'Fix login bug',
  priority: 'HIGH',
  dueDate: null,
  updatedAt: new Date('2026-06-10T10:00:00Z'),
  project: { key: 'TRAKK', name: 'Trakk' },
  statusColumn: { name: 'In Progress' },
};

const MOCK_ACTIVITY = {
  id: 'activity-uuid-1',
  ticketId: 'ticket-uuid-1',
  userId: USER_ID,
  action: 'status_changed',
  oldValue: 'To Do',
  newValue: 'In Progress',
  createdAt: new Date('2026-06-10T11:00:00Z'),
  user: { displayName: 'Alice' },
  ticket: {
    number: 1,
    projectId: PROJECT_ID_1,
    project: { key: 'TRAKK' },
  },
};

const MOCK_PROJECT_RAW = {
  id: PROJECT_ID_1,
  name: 'Trakk',
  key: 'TRAKK',
  description: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-06-01T00:00:00Z'),
  // columns ordered by position desc — first entry is the "Done" column
  columns: [{ id: 'col-done', position: 3 }, { id: 'col-review', position: 2 }, { id: 'col-todo', position: 0 }],
  // 2 open tickets (statusColumnId != 'col-done'), 1 closed
  tickets: [
    { id: 'ticket-open-1', statusColumnId: 'col-todo' },
    { id: 'ticket-open-2', statusColumnId: 'col-review' },
    { id: 'ticket-closed-1', statusColumnId: 'col-done' },
  ],
};

const MOCK_PROJECT_SUMMARY = {
  id: PROJECT_ID_1,
  name: 'Trakk',
  key: 'TRAKK',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  role: 'OWNER',
  openCount: 2,
  totalCount: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Re-apply $transaction mock after clearAllMocks (not used in this service,
  // but kept as a safety measure for future service changes).
});

describe('getDashboardData', () => {
  it('returns empty arrays when user has no project memberships', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([]);
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    mockPrisma.activityLog.findMany.mockResolvedValue([]);
    mockPrisma.project.findMany.mockResolvedValue([]);

    // Act
    const result = await getDashboardData(USER_ID);

    // Assert
    expect(result.tickets).toEqual([]);
    expect(result.activities).toEqual([]);
    expect(result.projects).toEqual([]);
  });

  it('returns tickets from ticket.findMany in the result', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([
      { projectId: PROJECT_ID_1 },
    ]);
    mockPrisma.ticket.findMany.mockResolvedValue([MOCK_TICKET]);
    mockPrisma.activityLog.findMany.mockResolvedValue([]);
    mockPrisma.project.findMany.mockResolvedValue([]);

    // Act
    const result = await getDashboardData(USER_ID);

    // Assert
    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0]).toEqual(MOCK_TICKET);
  });

  it('returns dueDate on each ticket', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([
      { projectId: PROJECT_ID_1 },
    ]);
    mockPrisma.ticket.findMany.mockResolvedValue([MOCK_TICKET]);
    mockPrisma.activityLog.findMany.mockResolvedValue([]);
    mockPrisma.project.findMany.mockResolvedValue([]);

    // Act
    const result = await getDashboardData(USER_ID);

    // Assert — wire shape is the string|null returned by Prisma, not a Date.
    expect(result.tickets[0].dueDate).toBeNull();
  });

  it('returns activities from activityLog.findMany in the result', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([
      { projectId: PROJECT_ID_1 },
    ]);
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    mockPrisma.activityLog.findMany.mockResolvedValue([MOCK_ACTIVITY]);
    mockPrisma.project.findMany.mockResolvedValue([]);

    // Act
    const result = await getDashboardData(USER_ID);

    // Assert
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toEqual(MOCK_ACTIVITY);
  });

  it('returns projects from project.findMany in the result', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([
      { projectId: PROJECT_ID_1, role: 'OWNER' },
    ]);
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    mockPrisma.activityLog.findMany.mockResolvedValue([]);
    mockPrisma.project.findMany.mockResolvedValue([MOCK_PROJECT_RAW]);

    // Act
    const result = await getDashboardData(USER_ID);

    // Assert
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toEqual(MOCK_PROJECT_SUMMARY);
  });

  it('passes correct projectId IN filter to ticket query when user has projects', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([
      { projectId: PROJECT_ID_1 },
      { projectId: PROJECT_ID_2 },
    ]);
    mockPrisma.ticket.findMany.mockResolvedValue([]);
    mockPrisma.activityLog.findMany.mockResolvedValue([]);
    mockPrisma.project.findMany.mockResolvedValue([]);

    // Act
    await getDashboardData(USER_ID);

    // Assert — ticket query must filter by both projectId AND assigneeId = userId
    const ticketCallArgs = mockPrisma.ticket.findMany.mock.calls[0][0];
    expect(ticketCallArgs.where.projectId.in).toEqual(
      expect.arrayContaining([PROJECT_ID_1, PROJECT_ID_2]),
    );
    expect(ticketCallArgs.where.assigneeId).toBe(USER_ID);
  });
});
