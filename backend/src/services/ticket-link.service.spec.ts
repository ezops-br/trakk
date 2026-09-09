// @ts-nocheck
// Mock prisma and event-broadcaster before importing the service.
// Mirrors comment.service.spec.ts pattern: $transaction is wired to invoke
// the callback with the same mock object as tx.

const mockBroadcast = jest.fn();

jest.mock('../lib/prisma', () => {
  const db = {
    $transaction: jest.fn(),
    projectMember: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    ticket: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    ticketLink: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    activityLog: {
      create: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(async (cb) => cb(db));
  return { prisma: db };
});

jest.mock('../lib/event-broadcaster', () => ({
  broadcast: mockBroadcast,
}));

import { prisma } from '../lib/prisma';
import { listLinks, createLink, deleteLink } from './ticket-link.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = '550e8400-e29b-4d41-a716-446655440001';
const PROJECT_ID = '550e8400-e29b-4d41-a716-446655440010';
const SOURCE_TICKET_ID = '550e8400-e29b-4d41-a716-446655440020';
const TARGET_TICKET_ID = '550e8400-e29b-4d41-a716-446655440021';
const LINK_ID = '550e8400-e29b-4d41-a716-446655440030';
const SOURCE_NUMBER = 42;
const TARGET_NUMBER = 43;

const MOCK_MEMBER_MEMBERSHIP = {
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'MEMBER' as const,
  joinedAt: new Date('2024-01-01'),
};

const MOCK_VIEWER_MEMBERSHIP = {
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'VIEWER' as const,
  joinedAt: new Date('2024-01-01'),
};

const MOCK_ACTIVE_PROJECT = {
  id: PROJECT_ID,
  key: 'TEST',
  archivedAt: null,
};

const MOCK_ARCHIVED_PROJECT = {
  id: PROJECT_ID,
  key: 'TEST',
  archivedAt: new Date('2024-06-01'),
};

const MOCK_SOURCE_TICKET = {
  id: SOURCE_TICKET_ID,
  projectId: PROJECT_ID,
  number: SOURCE_NUMBER,
  title: 'Source Ticket',
};

const MOCK_TARGET_TICKET = {
  id: TARGET_TICKET_ID,
  projectId: PROJECT_ID,
  number: TARGET_NUMBER,
  title: 'Target Ticket',
};

const MOCK_CREATED_LINK = {
  id: LINK_ID,
  sourceTicketId: SOURCE_TICKET_ID,
  targetTicketId: TARGET_TICKET_ID,
  type: 'BLOCKS' as const,
  createdByUserId: USER_ID,
  createdAt: new Date('2024-01-01'),
};

const MOCK_LINK_ROW = {
  id: LINK_ID,
  sourceTicketId: SOURCE_TICKET_ID,
  targetTicketId: TARGET_TICKET_ID,
  type: 'BLOCKS' as const,
  createdByUserId: USER_ID,
  createdAt: new Date('2024-01-01'),
  sourceTicket: {
    id: SOURCE_TICKET_ID,
    projectId: PROJECT_ID,
    number: SOURCE_NUMBER,
    title: 'Source Ticket',
    priority: 'MEDIUM',
    statusColumn: { name: 'In Progress' },
    project: { key: 'TEST' },
  },
  targetTicket: {
    id: TARGET_TICKET_ID,
    projectId: PROJECT_ID,
    number: TARGET_NUMBER,
    title: 'Target Ticket',
    priority: 'LOW',
    statusColumn: { name: 'Todo' },
    project: { key: 'TEST' },
  },
};

beforeEach(() => {
  jest.resetAllMocks();
  (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(mockPrisma));
});

// ─── listLinks ────────────────────────────────────────────────────────────────

describe('listLinks', () => {
  it('empty list — returns { links: [] }', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_SOURCE_TICKET);
    (mockPrisma.ticketLink.findMany as jest.Mock).mockResolvedValue([]);

    const result = await listLinks(USER_ID, PROJECT_ID, SOURCE_NUMBER);

    expect(result).toEqual({ links: [] });
    expect(mockPrisma.ticketLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ sourceTicketId: SOURCE_TICKET_ID }, { targetTicketId: SOURCE_TICKET_ID }] },
      }),
    );
  });

  it('happy path — BLOCKS where ticket is source renders "Blocks"', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_SOURCE_TICKET);
    (mockPrisma.ticketLink.findMany as jest.Mock).mockResolvedValue([MOCK_LINK_ROW]);

    const result = await listLinks(USER_ID, PROJECT_ID, SOURCE_NUMBER);

    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({
      id: LINK_ID,
      type: 'BLOCKS',
      direction: 'outgoing',
      displayType: 'Blocks',
      targetNumber: TARGET_NUMBER,
      targetTitle: 'Target Ticket',
    });
  });

  it('BLOCKS where ticket is target renders "Is blocked by"', async () => {
    // Ticket is on the target side this time — perspective flips.
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TARGET_TICKET);
    (mockPrisma.ticketLink.findMany as jest.Mock).mockResolvedValue([MOCK_LINK_ROW]);

    const result = await listLinks(USER_ID, PROJECT_ID, TARGET_NUMBER);

    expect(result.links[0]).toMatchObject({
      displayType: 'Is blocked by',
      direction: 'incoming',
      targetNumber: SOURCE_NUMBER,
      targetTitle: 'Source Ticket',
    });
  });

  it('VIEWER can list (read-only allowed)', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_VIEWER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_SOURCE_TICKET);
    (mockPrisma.ticketLink.findMany as jest.Mock).mockResolvedValue([]);

    const result = await listLinks(USER_ID, PROJECT_ID, SOURCE_NUMBER);

    expect(result).toEqual({ links: [] });
  });

  it('non-member throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(listLinks('non-member-id', PROJECT_ID, SOURCE_NUMBER)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.ticketLink.findMany).not.toHaveBeenCalled();
  });

  it('ticket not found throws 404', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(listLinks(USER_ID, PROJECT_ID, SOURCE_NUMBER)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockPrisma.ticketLink.findMany).not.toHaveBeenCalled();
  });
});

// ─── createLink ───────────────────────────────────────────────────────────────

describe('createLink', () => {
  const INPUT = { targetTicketNumber: TARGET_NUMBER, type: 'BLOCKS' as const };

  it('happy path MEMBER — link created, two activity logs, broadcast called', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock)
      .mockResolvedValueOnce(MOCK_SOURCE_TICKET) // source
      .mockResolvedValueOnce(MOCK_TARGET_TICKET); // target
    (mockPrisma.ticketLink.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.ticketLink.create as jest.Mock).mockResolvedValue(MOCK_CREATED_LINK);
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await createLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, INPUT);

    expect(result).toMatchObject({ link: expect.objectContaining({ id: LINK_ID }) });

    // Two activity rows — source + target — both with action: 'link_added'
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: SOURCE_TICKET_ID,
          action: 'link_added',
          newValue: 'TRK-TEST-43',
        }),
      }),
    );
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: TARGET_TICKET_ID,
          action: 'link_added',
          newValue: 'TRK-TEST-43',
        }),
      }),
    );

    // Broadcast carries link, sourceTicketNumber, targetTicketNumber
    expect(mockBroadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'link.created',
      expect.objectContaining({
        link: expect.objectContaining({ id: LINK_ID }),
        sourceTicketNumber: SOURCE_NUMBER,
        targetTicketNumber: TARGET_NUMBER,
      }),
    );
  });

  it('self-link throws 400', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    // Source and target resolve to the same ticket.
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_SOURCE_TICKET);

    await expect(
      createLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, INPUT),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.ticketLink.create).not.toHaveBeenCalled();
  });

  it('duplicate (same direction) throws 409', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock)
      .mockResolvedValueOnce(MOCK_SOURCE_TICKET)
      .mockResolvedValueOnce(MOCK_TARGET_TICKET);
    (mockPrisma.ticketLink.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: 'existing-same-dir' }) // duplicate hit
      .mockResolvedValueOnce(null);

    await expect(
      createLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, INPUT),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.ticketLink.create).not.toHaveBeenCalled();
  });

  it('inverse duplicate throws 409', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock)
      .mockResolvedValueOnce(MOCK_SOURCE_TICKET)
      .mockResolvedValueOnce(MOCK_TARGET_TICKET);
    (mockPrisma.ticketLink.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // same-dir miss
      .mockResolvedValueOnce({ id: 'existing-inverse' }); // inverse hit

    await expect(
      createLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, INPUT),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.ticketLink.create).not.toHaveBeenCalled();
  });

  it('VIEWER throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_VIEWER_MEMBERSHIP);

    await expect(
      createLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, INPUT),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketLink.create).not.toHaveBeenCalled();
  });

  it('non-member throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      createLink('non-member', PROJECT_ID, SOURCE_NUMBER, INPUT),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('archived project throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ARCHIVED_PROJECT);

    await expect(
      createLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, INPUT),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketLink.create).not.toHaveBeenCalled();
  });
});

// ─── deleteLink ───────────────────────────────────────────────────────────────

describe('deleteLink', () => {
  it('happy path MEMBER — link deleted, two activity logs, broadcast called', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_SOURCE_TICKET);
    (mockPrisma.ticketLink.findUnique as jest.Mock).mockResolvedValue(MOCK_CREATED_LINK);
    (mockPrisma.ticketLink.delete as jest.Mock).mockResolvedValue(MOCK_CREATED_LINK);
    (mockPrisma.ticket.findUnique as jest.Mock).mockResolvedValue({ number: TARGET_NUMBER });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await deleteLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, LINK_ID);

    expect(result).toEqual({ message: 'Link removed' });
    expect(mockPrisma.ticketLink.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LINK_ID } }),
    );

    // Two activity rows — current ticket + the other side — both link_removed.
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: SOURCE_TICKET_ID,
          action: 'link_removed',
          oldValue: 'TRK-TEST-43',
          newValue: null,
        }),
      }),
    );
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: TARGET_TICKET_ID,
          action: 'link_removed',
          oldValue: 'TRK-TEST-43',
        }),
      }),
    );

    expect(mockBroadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'link.deleted',
      expect.objectContaining({
        linkId: LINK_ID,
        sourceTicketId: SOURCE_TICKET_ID,
        targetTicketId: TARGET_TICKET_ID,
        ticketNumber: SOURCE_NUMBER,
      }),
    );
  });

  it('linkId not on this ticket throws 404', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_SOURCE_TICKET);
    // Link exists but belongs to two other tickets
    const otherLink = {
      ...MOCK_CREATED_LINK,
      sourceTicketId: 'other-ticket-a',
      targetTicketId: 'other-ticket-b',
    };
    (mockPrisma.ticketLink.findUnique as jest.Mock).mockResolvedValue(otherLink);

    await expect(
      deleteLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, LINK_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.ticketLink.delete).not.toHaveBeenCalled();
  });

  it('linkId not found throws 404', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_SOURCE_TICKET);
    (mockPrisma.ticketLink.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      deleteLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, LINK_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('VIEWER throws 403 before any DB write', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_VIEWER_MEMBERSHIP);

    await expect(
      deleteLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, LINK_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketLink.delete).not.toHaveBeenCalled();
  });

  it('archived project throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ARCHIVED_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_SOURCE_TICKET);

    await expect(
      deleteLink(USER_ID, PROJECT_ID, SOURCE_NUMBER, LINK_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketLink.delete).not.toHaveBeenCalled();
  });
});
