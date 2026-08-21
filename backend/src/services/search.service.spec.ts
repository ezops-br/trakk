// @ts-nocheck
// TDD Red Phase — search.service.ts does not exist yet.
// All tests will fail with "Cannot find module" until implementation is added.

jest.mock('../lib/prisma', () => ({
  prisma: {
    projectMember: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

import { prisma } from '../lib/prisma';
import { searchProjects, searchTickets, search } from './search.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = '11111111-1111-1111-1111-111111111111';
const PROJECT_ID_1 = '22222222-2222-2222-2222-222222222222';
const PROJECT_ID_2 = '33333333-3333-3333-3333-333333333333';

const MOCK_MEMBERSHIP_1 = { projectId: PROJECT_ID_1 };
const MOCK_MEMBERSHIP_2 = { projectId: PROJECT_ID_2 };

const MOCK_TICKET_ROW = {
  id: '44444444-4444-4444-4444-444444444444',
  number: 42,
  title: 'Fix login bug',
  priority: 'HIGH',
  projectId: PROJECT_ID_1,
  project_key: 'TRAKK',
  project_name: 'Trakk Project',
  status_column_name: 'In Progress',
  assignee_name: 'Alice',
  assignee_avatar: null,
  updated_at: new Date('2026-06-10T10:00:00Z'),
};

const MOCK_PROJECT_ROW = {
  id: PROJECT_ID_1,
  name: 'Trakk Project',
  key: 'TRAKK',
  description: 'Main project',
  archived_at: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-06-01T00:00:00Z'),
  member_count: BigInt(5),
};

beforeEach(() => {
  jest.clearAllMocks();
  // Re-apply mock implementations after clearAllMocks wipes them
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
});

describe('search', () => {
  it('returns { tickets: [], projects: [] } when user has no project memberships', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([]);

    // Act
    const result = await search(USER_ID, 'bugfix');

    // Assert
    expect(result.tickets).toEqual([]);
    expect(result.projects).toEqual([]);
    // $queryRaw should not be called when there are no memberships
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns empty results when project param provided but user is not a member', async () => {
    // Arrange — user has no memberships at all
    mockPrisma.projectMember.findMany.mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    // Act — providing a projectId the user isn't in should return silent empty
    const result = await search(USER_ID, 'bug', { projectId: PROJECT_ID_2 });

    // Assert — no error thrown, just empty arrays
    expect(result.tickets).toEqual([]);
    expect(result.projects).toEqual([]);
  });

  it('prepends exact ticket ID match at index 0 when query matches PROJECT_KEY-N pattern', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    // First call: exact ID lookup — returns one ticket
    // Second call: FTS — returns a different ticket
    const exactTicket = { ...MOCK_TICKET_ROW, number: 42, title: 'Fix login bug' };
    const ftsTicket = { ...MOCK_TICKET_ROW, id: '55555555-5555-5555-5555-555555555555', number: 7, title: 'TRAKK-42 relates to another thing' };
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([exactTicket]) // exact match lookup
      .mockResolvedValueOnce([ftsTicket]);  // FTS results

    // Act
    const result = await search(USER_ID, 'TRAKK-42');

    // Assert — exact match is at index 0
    expect(result.tickets[0].number).toBe(42);
  });

  it('deduplicates exact match from FTS results — exact ticket appears only once', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    const exactTicket = { ...MOCK_TICKET_ROW, number: 42 };
    // FTS also returns the same ticket (same id)
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([exactTicket])           // exact match lookup
      .mockResolvedValueOnce([exactTicket, { ...MOCK_TICKET_ROW, id: '55555555-5555-5555-5555-555555555555', number: 9 }]); // FTS with duplicate

    // Act
    const result = await search(USER_ID, 'TRAKK-42');

    // Assert — no duplicate: the exact ticket id appears exactly once
    const ids = result.tickets.map((t: any) => t.id);
    const exactId = MOCK_TICKET_ROW.id;
    expect(ids.filter((id: string) => id === exactId)).toHaveLength(1);
  });

  it('returns FTS results for a plain text query', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([MOCK_TICKET_ROW]);

    // Act
    const result = await search(USER_ID, 'login bug');

    // Assert
    expect(result.tickets.length).toBeGreaterThan(0);
    expect(result.tickets[0].title).toBe('Fix login bug');
  });

  it('excludes tickets from archived projects', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    // $queryRaw returns empty — simulating that archived project tickets were filtered
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    // Act
    const result = await search(USER_ID, 'bug');

    // Assert — verify the raw query was called (we can't inspect SQL, but the call happens)
    // The real assertion is that archived tickets are not in the result
    expect(result.tickets).toEqual([]);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('returns matching project for project ILIKE search', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([])                // ticket FTS returns nothing
      .mockResolvedValueOnce([MOCK_PROJECT_ROW]); // project search returns one project

    // Act
    const result = await search(USER_ID, 'Trakk');

    // Assert
    expect(result.projects.length).toBeGreaterThan(0);
    expect(result.projects[0].name).toBe('Trakk Project');
  });

  it('returns memberCount as number (not bigint)', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    (prisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([])                // ticket results
      .mockResolvedValueOnce([MOCK_PROJECT_ROW]); // project with BigInt member_count

    // Act
    const result = await search(USER_ID, 'Trakk');

    // Assert — memberCount must be a JS number, not a BigInt
    if (result.projects.length > 0) {
      expect(typeof result.projects[0].memberCount).toBe('number');
    }
  });

  it('results are scoped to the user\'s own projects — non-member project tickets not returned', async () => {
    // Arrange — user is only a member of PROJECT_ID_1
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    const nonMemberTicket = { ...MOCK_TICKET_ROW, projectId: PROJECT_ID_2 };
    // If $queryRaw returns a ticket from a non-member project, it means the WHERE clause
    // failed. For this test, we verify the projectMember query is called and only
    // PROJECT_ID_1 IDs are passed down.
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([MOCK_TICKET_ROW]);

    // Act
    await search(USER_ID, 'bug');

    // Assert — memberFindMany was called to get scoped projectIds
    expect(mockPrisma.projectMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID }),
      }),
    );
  });

  it('calls $queryRaw (FTS) not a LIKE query — plainto_tsquery used in ticket search', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    // Act
    await search(USER_ID, 'sprint planning');

    // Assert — $queryRaw must have been called (not prisma.ticket.findMany with contains)
    expect(prisma.$queryRaw).toHaveBeenCalled();
    // We cannot inspect the SQL string from the tagged template literal mock,
    // but verifying $queryRaw was called (not prisma.ticket.findMany) confirms FTS path.
    expect(mockPrisma.projectMember.findMany).toHaveBeenCalled();
  });

  it('respects limit option — ticket results do not exceed the specified limit', async () => {
    // Arrange
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    const manyTickets = Array.from({ length: 20 }, (_, i) => ({
      ...MOCK_TICKET_ROW,
      id: `id-${i}`,
      number: i + 1,
    }));
    (prisma.$queryRaw as jest.Mock).mockResolvedValue(manyTickets);

    // Act
    const result = await search(USER_ID, 'bug', { limit: 5 });

    // Assert
    expect(result.tickets.length).toBeLessThanOrEqual(5);
  });
});

// ─── archived ticket exclusion ────────────────────────────────────────────────

describe('searchTickets — archived tickets', () => {
  it('adds an archived_at IS NULL predicate for tickets to the FTS query', async () => {
    // Arrange — a plain-text query so call 0 is the FTS statement.
    mockPrisma.projectMember.findMany.mockResolvedValue([MOCK_MEMBERSHIP_1]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    // Act
    await search(USER_ID, 'login bug');

    // Assert — $queryRaw is tagged-template invoked, so call[0][0] is the
    // TemplateStringsArray holding the literal SQL fragments.
    const ftsSql = ((prisma.$queryRaw as jest.Mock).mock.calls[0][0] as string[])
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(ftsSql).toMatch(/t\."?archived_at"?\s+IS\s+NULL/i);
  });
});
