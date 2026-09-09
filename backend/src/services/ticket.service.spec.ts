// @ts-nocheck
// Mock prisma before importing the service.
jest.mock('../lib/prisma', () => {
  const db = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    projectMember: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    ticketAttachment: {
      findMany: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    statusColumn: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    ticket: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    label: {
      findFirst: jest.fn(),
    },
    ticketLabel: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    activityLog: {
      create: jest.fn(),
      count: jest.fn(),
    },
    comment: {
      count: jest.fn(),
    },
    ticketLink: {
      count: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(async (cb) => cb(db));
  return { prisma: db };
});

// Mock the in-memory SSE broadcaster so the overdue-timer wiring can be asserted.
jest.mock('../lib/event-broadcaster', () => ({
  broadcast: jest.fn(),
}));

import { prisma } from '../lib/prisma';
import { broadcast } from '../lib/event-broadcaster';
import {
  createTicket,
  getTicketByNumber,
  updateTicket,
  deleteTicket,
  getDeletionImpact,
  reorderTickets,
  addLabelToTicket,
  removeLabelFromTicket,
  listTickets,
  rehydrateOverdueTimers,
  bulkUpdate,
} from './ticket.service';
import { listAttachments } from './ticket-attachment.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = 'user-uuid-1';
const PROJECT_ID = 'proj-uuid-1';
const OTHER_PROJECT_ID = 'proj-uuid-2';
const COLUMN_ID = 'col-uuid-1';
const LABEL_ID = 'label-uuid-1';
const TICKET_ID = 'ticket-uuid-1';

const MEMBER_MEMBERSHIP = {
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'MEMBER' as const,
  joinedAt: new Date('2024-01-01'),
};

const ACTIVE_PROJECT = { id: PROJECT_ID, archivedAt: null };

const BASE_INPUT = {
  title: 'Fix login bug',
  statusColumnId: COLUMN_ID,
  priority: 'HIGH',
};

beforeEach(() => {
  jest.clearAllMocks();
  // Restore $transaction pass-through after clearAllMocks wipes implementations.
  (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(mockPrisma));
});

// ─── createTicket ─────────────────────────────────────────────────────────────

describe('createTicket', () => {
  it('assigns the next per-project number from the FOR UPDATE raw query', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue({
      id: COLUMN_ID,
      projectId: PROJECT_ID,
    });
    // Concurrency-safe counter: the locked raw query returns the next number.
    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ next_number: 5 }]);
    (mockPrisma.ticket.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: TICKET_ID,
      ...data,
    }));
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    const result = await createTicket(USER_ID, PROJECT_ID, BASE_INPUT);

    // Assert
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(result).toMatchObject({ number: 5, title: 'Fix login bug' });
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 5 }) }),
    );
  });

  it('writes a "created" activity log entry on success', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue({
      id: COLUMN_ID,
      projectId: PROJECT_ID,
    });
    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ next_number: 1 }]);
    (mockPrisma.ticket.create as jest.Mock).mockResolvedValue({ id: TICKET_ID, number: 1 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    await createTicket(USER_ID, PROJECT_ID, BASE_INPUT);

    // Assert
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'created', userId: USER_ID }),
      }),
    );
  });

  it('throws 403 when a VIEWER attempts to create a ticket', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MEMBER_MEMBERSHIP,
      role: 'VIEWER',
    });

    // Act & Assert
    await expect(createTicket(USER_ID, PROJECT_ID, BASE_INPUT)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });

  it('throws 400 when the status column belongs to a different project', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    // Column lookup scoped to this project returns nothing → cross-project reference.
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(createTicket(USER_ID, PROJECT_ID, BASE_INPUT)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.ticket.create).not.toHaveBeenCalled();
  });
});

// ─── getTicketByNumber ──────────────────────────────────────────────────────

describe('getTicketByNumber', () => {
  it('caps the activity log include at 50 entries', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MEMBER_MEMBERSHIP,
      role: 'VIEWER',
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      activityLogs: [],
      targetLinks: [],
    });

    // Act
    await getTicketByNumber(USER_ID, PROJECT_ID, 42);

    // Assert — the include must request at most 50 activity log rows
    const callArg = (mockPrisma.ticket.findFirst as jest.Mock).mock.calls[0][0];
    expect(callArg.include.activityLogs.take).toBe(50);
  });

  it('derives blockedBy from the include and strips targetLinks from the output', async () => {
    // Arrange — ticket is targeted by a BLOCKS link.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MEMBER_MEMBERSHIP,
      role: 'VIEWER',
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      activityLogs: [],
      targetLinks: [{ id: 'link-uuid-42' }],
    });

    // Act
    const result = await getTicketByNumber(USER_ID, PROJECT_ID, 42);

    // Assert — the include filters by BLOCKS type, the boolean surfaces true,
    // and the raw junction shape is stripped from the serialized ticket.
    const callArg = (mockPrisma.ticket.findFirst as jest.Mock).mock.calls[0][0];
    expect(callArg.include.targetLinks).toEqual({
      where: { type: 'BLOCKS' },
      select: { id: true },
    });
    expect(result.blockedBy).toBe(true);
    expect((result as Record<string, unknown>).targetLinks).toBeUndefined();
  });

  it('exposes the relative /api/v1/projects/.../raw URL for each attachment (no PUBLIC_BACKEND_URL dependency)', async () => {
    // Arrange — a ticket with a single attachment. PUBLIC_BACKEND_URL is unset,
    // but the URL must still be the relative path served by the new GET .../raw
    // route — the frontend builds an absolute URL from window.location, and the
    // backend never rewrites it.
    const originalEnv = process.env.PUBLIC_BACKEND_URL;
    delete process.env.PUBLIC_BACKEND_URL;
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MEMBER_MEMBERSHIP,
      role: 'VIEWER',
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      activityLogs: [],
      targetLinks: [],
      attachments: [
        {
          id: 'att-uuid-1',
          ticketId: TICKET_ID,
          uploaderId: USER_ID,
          uploader: { id: USER_ID, displayName: 'Tester' },
          mimeType: 'image/png',
          originalName: 'diagram.png',
          sizeBytes: 1024,
          bytes: Buffer.from('fake-bytes'),
          createdAt: new Date('2024-01-02'),
        },
      ],
    });

    // Act
    const result = await getTicketByNumber(USER_ID, PROJECT_ID, 42);

    // Assert — relative URL built from projectId + ticketNumber + attachmentId
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].url).toBe(
      '/api/v1/projects/' + PROJECT_ID + '/tickets/42/attachments/att-uuid-1/raw',
    );
    // DTO must not carry the raw bytes or any storageKey/url field.
    expect(result.attachments[0]).not.toHaveProperty('bytes');
    expect(result.attachments[0]).not.toHaveProperty('storageKey');

    // Restore for following tests.
    if (originalEnv !== undefined) {
      process.env.PUBLIC_BACKEND_URL = originalEnv;
    } else {
      delete process.env.PUBLIC_BACKEND_URL;
    }
  });

  it('narrows TICKET_INCLUDE.attachments to a select that omits bytes (bytea is fetched lazily by the GET .../raw route)', async () => {
    // Arrange — the embed is used by the ticket detail sheet for metadata + url
    // only; the raw bytes are pulled lazily by the dedicated download endpoint.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MEMBER_MEMBERSHIP,
      role: 'VIEWER',
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      activityLogs: [],
      targetLinks: [],
      attachments: [],
    });

    // Act
    await getTicketByNumber(USER_ID, PROJECT_ID, 42);

    // Assert — the include.attachments.select exists and explicitly does NOT
    // select `bytes`. Without the narrow `select`, Prisma would `SELECT *` and
    // pull every BYTEA off Postgres on every ticket list/detail call.
    const callArg = (mockPrisma.ticket.findFirst as jest.Mock).mock.calls[0][0];
    // The narrow `select` keeps Prisma from `SELECT *`-ing the BYTEA on every
    // ticket list/detail call.
    expect(callArg.include.attachments.select).toBeDefined();
    expect(callArg.include.attachments.select).not.toHaveProperty('bytes');
  });
});

// ─── updateTicket ─────────────────────────────────────────────────────────────

describe('updateTicket', () => {
  it('writes a per-field activity log entry when the title changes', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      title: 'Old title',
      description: null,
      statusColumnId: COLUMN_ID,
      priority: 'NONE',
      assigneeId: null,
    });
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      title: 'New title',
    });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    await updateTicket(USER_ID, PROJECT_ID, 42, { title: 'New title' });

    // Assert
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'title_updated',
          oldValue: 'Old title',
          newValue: 'New title',
        }),
      }),
    );
  });

  it('writes a due_date_set activity log entry when dueDate changes to a non-null value', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      title: 'Title',
      description: null,
      statusColumnId: COLUMN_ID,
      priority: 'NONE',
      assigneeId: null,
      dueDate: null,
    });
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({ id: TICKET_ID, number: 42 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    await updateTicket(USER_ID, PROJECT_ID, 42, { dueDate: '2024-08-15T00:00:00.000Z' });

    // Assert
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'due_date_set',
          oldValue: null,
          newValue: '2024-08-15 00:00',
        }),
      }),
    );
  });

  it('writes a due_date_cleared activity log entry when dueDate is set to null', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      title: 'Title',
      description: null,
      statusColumnId: COLUMN_ID,
      priority: 'NONE',
      assigneeId: null,
      dueDate: new Date('2024-08-15T00:00:00.000Z'),
    });
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({ id: TICKET_ID, number: 42 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    await updateTicket(USER_ID, PROJECT_ID, 42, { dueDate: null });

    // Assert
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'due_date_cleared',
          oldValue: '2024-08-15 00:00',
          newValue: null,
        }),
      }),
    );
  });

  it('does not log when dueDate is written with the same value as the current one', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      title: 'Title',
      description: null,
      statusColumnId: COLUMN_ID,
      priority: 'NONE',
      assigneeId: null,
      dueDate: new Date('2024-08-15T00:00:00.000Z'),
    });
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({ id: TICKET_ID, number: 42 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    await updateTicket(USER_ID, PROJECT_ID, 42, { dueDate: '2024-08-15T00:00:00.000Z' });

    // Assert
    expect(mockPrisma.activityLog.create).not.toHaveBeenCalled();
  });
});

// ─── deleteTicket ─────────────────────────────────────────────────────────────

describe('deleteTicket', () => {
  it('throws 400 when the project is archived (archived guard)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      archivedAt: new Date('2024-02-01'),
    });

    // Act & Assert
    await expect(deleteTicket(USER_ID, PROJECT_ID, 42)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.ticket.delete).not.toHaveBeenCalled();
  });
});

describe('deleteTicket dependency summary', () => {
  // Helper: arrange deleteTicket for the dependency-summary happy path.
  function arrangeDeleteWithCounts(counts: {
    comments: number;
    linkedAsSource: number;
    linkedAsTarget: number;
    activityLogEntries: number;
    ticketLabels: number;
  }) {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      dueDate: null,
    });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.ticket.delete as jest.Mock).mockResolvedValue({});
    (mockPrisma.comment.count as jest.Mock).mockResolvedValue(counts.comments);
    (mockPrisma.ticketLink.count as jest.Mock).mockImplementation(async (args: { where?: { sourceTicketId?: string; targetTicketId?: string } }) => {
      if (args?.where?.sourceTicketId) {
        return counts.linkedAsSource;
      }
      if (args?.where?.targetTicketId) {
        return counts.linkedAsTarget;
      }
      return 0;
    });
    (mockPrisma.activityLog.count as jest.Mock).mockResolvedValue(counts.activityLogEntries);
    (mockPrisma.ticketLabel.count as jest.Mock).mockResolvedValue(counts.ticketLabels);
  }

  it('returns a dependency summary whose counts match the five count calls', async () => {
    // Arrange
    arrangeDeleteWithCounts({
      comments: 7,
      linkedAsSource: 3,
      linkedAsTarget: 2,
      activityLogEntries: 11,
      ticketLabels: 4,
    });

    // Act
    const result = await deleteTicket(USER_ID, PROJECT_ID, 42);

    // Assert — envelope shape.
    expect(result).toMatchObject({
      ticketNumber: 42,
      deleted: true,
      dependencies: {
        comments: 7,
        linkedAsSource: 3,
        linkedAsTarget: 2,
        activityLogEntries: 11,
        ticketLabels: 4,
      },
    });
    expect(result.deletedAt).toBeInstanceOf(Date);
  });

  it('runs all five count calls scoped to the deleted ticket id', async () => {
    // Arrange
    arrangeDeleteWithCounts({
      comments: 1,
      linkedAsSource: 1,
      linkedAsTarget: 1,
      activityLogEntries: 1,
      ticketLabels: 1,
    });

    // Act
    await deleteTicket(USER_ID, PROJECT_ID, 42);

    // Assert — each count was called with the ticket id in its where clause.
    expect(mockPrisma.comment.count).toHaveBeenCalledWith({ where: { ticketId: TICKET_ID } });
    expect(mockPrisma.ticketLink.count).toHaveBeenCalledWith({ where: { sourceTicketId: TICKET_ID } });
    expect(mockPrisma.ticketLink.count).toHaveBeenCalledWith({ where: { targetTicketId: TICKET_ID } });
    expect(mockPrisma.activityLog.count).toHaveBeenCalledWith({ where: { ticketId: TICKET_ID } });
    expect(mockPrisma.ticketLabel.count).toHaveBeenCalledWith({ where: { ticketId: TICKET_ID } });
  });

  it('calls prisma.ticket.delete exactly once', async () => {
    // Arrange
    arrangeDeleteWithCounts({
      comments: 0,
      linkedAsSource: 0,
      linkedAsTarget: 0,
      activityLogEntries: 0,
      ticketLabels: 0,
    });

    // Act
    await deleteTicket(USER_ID, PROJECT_ID, 42);

    // Assert
    expect(mockPrisma.ticket.delete).toHaveBeenCalledTimes(1);
    expect(mockPrisma.ticket.delete).toHaveBeenCalledWith({ where: { id: TICKET_ID } });
  });

  it('still broadcasts ticket.deleted after returning the dependency summary', async () => {
    // Arrange
    arrangeDeleteWithCounts({
      comments: 2,
      linkedAsSource: 1,
      linkedAsTarget: 0,
      activityLogEntries: 4,
      ticketLabels: 1,
    });

    // Act
    await deleteTicket(USER_ID, PROJECT_ID, 42);

    // Assert — broadcast is invoked once with the expected channel + payload.
    expect(broadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'ticket.deleted',
      expect.objectContaining({ ticketId: TICKET_ID, number: 42 }),
    );
  });

  it('throws 403 when a VIEWER attempts to delete the ticket', async () => {
    // Arrange — viewer role, no other mocks needed.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MEMBER_MEMBERSHIP,
      role: 'VIEWER',
    });

    // Act & Assert
    await expect(deleteTicket(USER_ID, PROJECT_ID, 42)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.ticket.delete).not.toHaveBeenCalled();
    expect(mockPrisma.comment.count).not.toHaveBeenCalled();
  });
});

// ─── getDeletionImpact ─────────────────────────────────────────────────────────

describe('getDeletionImpact', () => {
  // Helper: arrange getDeletionImpact for the happy path with the five counts.
  function arrangeImpactWithCounts(counts: {
    comments: number;
    linkedAsSource: number;
    linkedAsTarget: number;
    activityLogEntries: number;
    ticketLabels: number;
  }) {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
    });
    (mockPrisma.comment.count as jest.Mock).mockResolvedValue(counts.comments);
    (mockPrisma.ticketLink.count as jest.Mock).mockImplementation(async (args: { where?: { sourceTicketId?: string; targetTicketId?: string } }) => {
      if (args?.where?.sourceTicketId) {
        return counts.linkedAsSource;
      }
      if (args?.where?.targetTicketId) {
        return counts.linkedAsTarget;
      }
      return 0;
    });
    (mockPrisma.activityLog.count as jest.Mock).mockResolvedValue(counts.activityLogEntries);
    (mockPrisma.ticketLabel.count as jest.Mock).mockResolvedValue(counts.ticketLabels);
  }

  it('returns { ticketNumber, dependencies } matching the mocked counts', async () => {
    // Arrange
    arrangeImpactWithCounts({
      comments: 7,
      linkedAsSource: 3,
      linkedAsTarget: 2,
      activityLogEntries: 11,
      ticketLabels: 4,
    });

    // Act
    const result = await getDeletionImpact(USER_ID, PROJECT_ID, 42);

    // Assert — envelope shape with no `deleted` / `deletedAt` fields.
    expect(result).toEqual({
      ticketNumber: 42,
      dependencies: {
        comments: 7,
        linkedAsSource: 3,
        linkedAsTarget: 2,
        activityLogEntries: 11,
        ticketLabels: 4,
      },
    });
  });

  it('runs all five count calls scoped to the ticket id', async () => {
    // Arrange
    arrangeImpactWithCounts({
      comments: 1,
      linkedAsSource: 1,
      linkedAsTarget: 1,
      activityLogEntries: 1,
      ticketLabels: 1,
    });

    // Act
    await getDeletionImpact(USER_ID, PROJECT_ID, 42);

    // Assert — each count was called with the ticket id in its where clause.
    expect(mockPrisma.comment.count).toHaveBeenCalledWith({ where: { ticketId: TICKET_ID } });
    expect(mockPrisma.ticketLink.count).toHaveBeenCalledWith({ where: { sourceTicketId: TICKET_ID } });
    expect(mockPrisma.ticketLink.count).toHaveBeenCalledWith({ where: { targetTicketId: TICKET_ID } });
    expect(mockPrisma.activityLog.count).toHaveBeenCalledWith({ where: { ticketId: TICKET_ID } });
    expect(mockPrisma.ticketLabel.count).toHaveBeenCalledWith({ where: { ticketId: TICKET_ID } });
  });

  it('does NOT call prisma.ticket.delete', async () => {
    // Arrange
    arrangeImpactWithCounts({
      comments: 0,
      linkedAsSource: 0,
      linkedAsTarget: 0,
      activityLogEntries: 0,
      ticketLabels: 0,
    });

    // Act
    await getDeletionImpact(USER_ID, PROJECT_ID, 42);

    // Assert — preview is read-only.
    expect(mockPrisma.ticket.delete).not.toHaveBeenCalled();
  });

  it('throws 403 when the caller is not a project member', async () => {
    // Arrange — no membership row.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(getDeletionImpact(USER_ID, PROJECT_ID, 42)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.ticket.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.comment.count).not.toHaveBeenCalled();
  });

  it('throws 404 when the ticket does not exist', async () => {
    // Arrange — caller is a member, but the ticket lookup misses.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(getDeletionImpact(USER_ID, PROJECT_ID, 99)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockPrisma.comment.count).not.toHaveBeenCalled();
  });

  it('allows VIEWERs to preview the dependency counts', async () => {
    // Arrange — viewer role; counts are all zero for clarity.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MEMBER_MEMBERSHIP,
      role: 'VIEWER',
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
    });
    (mockPrisma.comment.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.ticketLink.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.activityLog.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.ticketLabel.count as jest.Mock).mockResolvedValue(0);

    // Act
    const result = await getDeletionImpact(USER_ID, PROJECT_ID, 42);

    // Assert — VIEWER is allowed; the result is returned, not rejected.
    expect(result).toMatchObject({ ticketNumber: 42, dependencies: expect.any(Object) });
  });
});

// ─── reorderTickets ───────────────────────────────────────────────────────────

describe('reorderTickets', () => {
  it('throws 400 when not all ticket IDs belong to the project (cross-project)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    const updates = [
      { ticketId: 'ticket-a', sortOrder: 1, statusColumnId: COLUMN_ID },
      { ticketId: 'ticket-b', sortOrder: 2, statusColumnId: COLUMN_ID },
    ];
    // Ownership validation: only 1 of the 2 ticket IDs actually belongs to the project.
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      { id: 'ticket-a', assigneeId: ASSIGNEE_ID, statusColumnId: COLUMN_ID },
    ]);

    // Act & Assert
    await expect(reorderTickets(USER_ID, PROJECT_ID, updates)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it('throws 400 when an unassigned ticket is moved into an "in progress" column', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    // Source ticket is unassigned and currently in a non-in-progress column.
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      { id: 'ticket-a', assigneeId: null, statusColumnId: COLUMN_ID },
    ]);
    // The target column name triggers the guard.
    (mockPrisma.statusColumn.findUnique as jest.Mock).mockResolvedValue({
      id: NEW_COLUMN_ID,
      name: 'in_progress',
    });

    // Act & Assert
    await expect(
      reorderTickets(USER_ID, PROJECT_ID, [
        { ticketId: 'ticket-a', sortOrder: 1, statusColumnId: NEW_COLUMN_ID },
      ]),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot move an unassigned ticket to "in progress"',
    });
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it('allows moving an assigned ticket into an "in progress" column', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      { id: 'ticket-a', assigneeId: ASSIGNEE_ID, statusColumnId: COLUMN_ID },
    ]);
    // Status column lookup must NOT be called for assigned tickets.
    (mockPrisma.statusColumn.findUnique as jest.Mock).mockResolvedValue(null);
    // reorderTickets uses array-form $transaction.
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (arr) => Promise.all(arr));
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({});

    // Act
    const result = await reorderTickets(USER_ID, PROJECT_ID, [
      { ticketId: 'ticket-a', sortOrder: 1, statusColumnId: NEW_COLUMN_ID },
    ]);

    // Assert
    expect(result).toEqual({ updated: 1 });
    expect(mockPrisma.statusColumn.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-a' },
      data: { sortOrder: 1, statusColumnId: NEW_COLUMN_ID },
    });
  });

  it('allows moving an unassigned ticket to a non-in-progress column', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      { id: 'ticket-a', assigneeId: null, statusColumnId: COLUMN_ID },
    ]);
    // Target column is "Done" — must not trigger the guard.
    (mockPrisma.statusColumn.findUnique as jest.Mock).mockResolvedValue({
      id: NEW_COLUMN_ID,
      name: 'Done',
    });
    // reorderTickets uses array-form $transaction.
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (arr) => Promise.all(arr));
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({});

    // Act
    const result = await reorderTickets(USER_ID, PROJECT_ID, [
      { ticketId: 'ticket-a', sortOrder: 1, statusColumnId: NEW_COLUMN_ID },
    ]);

    // Assert
    expect(result).toEqual({ updated: 1 });
    expect(mockPrisma.statusColumn.findUnique).toHaveBeenCalledWith({
      where: { id: NEW_COLUMN_ID },
    });
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-a' },
      data: { sortOrder: 1, statusColumnId: NEW_COLUMN_ID },
    });
  });
});

// ─── addLabelToTicket ─────────────────────────────────────────────────────────

describe('addLabelToTicket', () => {
  it('throws 409 when the label is already assigned to the ticket', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({ id: TICKET_ID, number: 42 });
    (mockPrisma.label.findFirst as jest.Mock).mockResolvedValue({
      id: LABEL_ID,
      projectId: PROJECT_ID,
    });
    // The join row already exists → duplicate.
    (mockPrisma.ticketLabel.findUnique as jest.Mock).mockResolvedValue({
      ticketId: TICKET_ID,
      labelId: LABEL_ID,
    });

    // Act & Assert
    await expect(
      addLabelToTicket(USER_ID, PROJECT_ID, 42, LABEL_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.ticketLabel.create).not.toHaveBeenCalled();
  });
});

// ─── removeLabelFromTicket ────────────────────────────────────────────────────

describe('removeLabelFromTicket', () => {
  it('throws 404 when the label is not assigned to the ticket', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({ id: TICKET_ID, number: 42 });
    // No join row → nothing to remove.
    (mockPrisma.ticketLabel.findUnique as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(
      removeLabelFromTicket(USER_ID, PROJECT_ID, 42, LABEL_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.ticketLabel.delete).not.toHaveBeenCalled();
  });
});

// ─── listTickets ───────────────────────────────────────────────────────────────

describe('listTickets', () => {
  it('defaults to sortOrder asc when no sort or order is provided', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    await listTickets(USER_ID, PROJECT_ID, { page: 1, pageSize: 50 });

    // Assert — the new code passes { sortOrder: 'asc' } (with id tie-breaker)
    // for the default. This is a deliberate change from the old
    // statusColumnId-then-sortOrder default to align with the new whitelist.
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('maps sort=number & order=desc to { number: "desc" } with the id tie-breaker', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      sort: 'number',
      order: 'desc',
    });

    // Assert
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ number: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('maps sort=assignee to { assignee: { displayName: "asc" } } (default order)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      sort: 'assignee',
    });

    // Assert
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ assignee: { displayName: 'asc' } }, { id: 'asc' }],
      }),
    );
  });

  it('passes nulls: "last" for dueDate regardless of order direction', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act — desc direction still keeps NULLs last
    await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      sort: 'dueDate',
      order: 'desc',
    });

    // Assert
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ dueDate: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      }),
    );
  });

  it('sorts by priority rank in application code when sort=priority (URGENT first for asc)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    // The priority path fetches ALL matching rows without skip/take, then sorts in JS.
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      { id: 'ticket-low',    priority: 'LOW',    statusColumnId: 'c1', assigneeId: null, reporterId: USER_ID, projectId: PROJECT_ID, title: 'low',    description: null, number: 1, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), dueDate: null, assignee: null, reporter: { id: USER_ID, displayName: 'u', avatarUrl: null }, statusColumn: { id: 'c1', name: 'Todo', position: 0 }, labels: [] },
      { id: 'ticket-urgent', priority: 'URGENT', statusColumnId: 'c1', assigneeId: null, reporterId: USER_ID, projectId: PROJECT_ID, title: 'urgent', description: null, number: 2, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), dueDate: null, assignee: null, reporter: { id: USER_ID, displayName: 'u', avatarUrl: null }, statusColumn: { id: 'c1', name: 'Todo', position: 0 }, labels: [] },
      { id: 'ticket-high',   priority: 'HIGH',   statusColumnId: 'c1', assigneeId: null, reporterId: USER_ID, projectId: PROJECT_ID, title: 'high',   description: null, number: 3, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), dueDate: null, assignee: null, reporter: { id: USER_ID, displayName: 'u', avatarUrl: null }, statusColumn: { id: 'c1', name: 'Todo', position: 0 }, labels: [] },
    ]);

    // Act
    const result = await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      sort: 'priority',
      order: 'asc',
    });

    // Assert — priority path is the only one that does NOT use DB-side orderBy.
    // Instead, the function calls findMany WITHOUT a custom orderBy (just the
    // stable id tie-breaker) and sorts the returned array in JS.
    const findManyCall = (mockPrisma.ticket.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.orderBy).toEqual([{ id: 'asc' }]);
    // And the result is URGENT → HIGH → LOW.
    expect(result.tickets.map((t) => t.priority)).toEqual(['URGENT', 'HIGH', 'LOW']);
  });

  it('reverses priority order when order=desc (NONE first → URGENT last)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      { id: 'ticket-urgent', priority: 'URGENT', statusColumnId: 'c1', assigneeId: null, reporterId: USER_ID, projectId: PROJECT_ID, title: 'urgent', description: null, number: 1, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), dueDate: null, assignee: null, reporter: { id: USER_ID, displayName: 'u', avatarUrl: null }, statusColumn: { id: 'c1', name: 'Todo', position: 0 }, labels: [] },
      { id: 'ticket-none',   priority: 'NONE',   statusColumnId: 'c1', assigneeId: null, reporterId: USER_ID, projectId: PROJECT_ID, title: 'none',   description: null, number: 2, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), dueDate: null, assignee: null, reporter: { id: USER_ID, displayName: 'u', avatarUrl: null }, statusColumn: { id: 'c1', name: 'Todo', position: 0 }, labels: [] },
    ]);

    // Act
    const result = await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      sort: 'priority',
      order: 'desc',
    });

    // Assert
    expect(result.tickets.map((t) => t.priority)).toEqual(['NONE', 'URGENT']);
  });

  it('returns priority-sorted slice across pages (page 2 of a 3-item set with pageSize 1)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      { id: 't-low',    priority: 'LOW',    statusColumnId: 'c1', assigneeId: null, reporterId: USER_ID, projectId: PROJECT_ID, title: 'l', description: null, number: 1, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), dueDate: null, assignee: null, reporter: { id: USER_ID, displayName: 'u', avatarUrl: null }, statusColumn: { id: 'c1', name: 'Todo', position: 0 }, labels: [] },
      { id: 't-urgent', priority: 'URGENT', statusColumnId: 'c1', assigneeId: null, reporterId: USER_ID, projectId: PROJECT_ID, title: 'u', description: null, number: 2, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), dueDate: null, assignee: null, reporter: { id: USER_ID, displayName: 'u', avatarUrl: null }, statusColumn: { id: 'c1', name: 'Todo', position: 0 }, labels: [] },
      { id: 't-high',   priority: 'HIGH',   statusColumnId: 'c1', assigneeId: null, reporterId: USER_ID, projectId: PROJECT_ID, title: 'h', description: null, number: 3, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), dueDate: null, assignee: null, reporter: { id: USER_ID, displayName: 'u', avatarUrl: null }, statusColumn: { id: 'c1', name: 'Todo', position: 0 }, labels: [] },
    ]);

    // Act — page 2 of 3 (with pageSize 1) should be the middle priority
    const result = await listTickets(USER_ID, PROJECT_ID, {
      page: 2,
      pageSize: 1,
      sort: 'priority',
      order: 'asc',
    });

    // Assert
    expect(result.tickets.map((t) => t.priority)).toEqual(['HIGH']);
  });

  it('adds where.dueDate { gte, lte } when dueDateFrom and dueDateTo are provided', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-31T23:59:59.999Z');
    await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      dueDateFrom: from,
      dueDateTo: to,
    });

    // Assert
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: PROJECT_ID,
          dueDate: { gte: from, lte: to },
        }),
      }),
    );
  });

  it('adds where.dueDate { lt } when dueDateFilter=overdue is provided', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      dueDateFilter: 'overdue',
    });

    // Assert — overdue means dueDate < now (inclusive boundary is now, exclusive).
    const findManyCall = (mockPrisma.ticket.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.dueDate).toEqual({ lt: expect.any(Date) });
    const ltValue = findManyCall.where.dueDate.lt as Date;
    expect(Math.abs(ltValue.getTime() - Date.now())).toBeLessThan(2_000);
  });

  it('adds where.dueDate { gte, lte } bracketing the current day when dueDateFilter=today', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      dueDateFilter: 'today',
    });

    // Assert — today spans local-server-day start to end (both ends inclusive).
    const findManyCall = (mockPrisma.ticket.findMany as jest.Mock).mock.calls[0][0];
    const dueDate = findManyCall.where.dueDate as { gte: Date; lte: Date };
    expect(dueDate.gte.getHours()).toBe(0);
    expect(dueDate.gte.getMinutes()).toBe(0);
    expect(dueDate.gte.getSeconds()).toBe(0);
    expect(dueDate.gte.getMilliseconds()).toBe(0);
    expect(dueDate.lte.getHours()).toBe(23);
    expect(dueDate.lte.getMinutes()).toBe(59);
    expect(dueDate.lte.getSeconds()).toBe(59);
    expect(dueDate.lte.getMilliseconds()).toBe(999);
    // Same calendar day on the local server clock.
    expect(dueDate.gte.getFullYear()).toBe(dueDate.lte.getFullYear());
    expect(dueDate.gte.getMonth()).toBe(dueDate.lte.getMonth());
    expect(dueDate.gte.getDate()).toBe(dueDate.lte.getDate());
  });

  it('caps dueDateFilter=this_week to the upcoming Sunday 23:59:59.999 (local)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      dueDateFilter: 'this_week',
    });

    // Assert — the upper bound must be Sunday 23:59:59.999 on the local clock.
    const findManyCall = (mockPrisma.ticket.findMany as jest.Mock).mock.calls[0][0];
    const dueDate = findManyCall.where.dueDate as { gte: Date; lte: Date };
    expect(dueDate.lte.getDay()).toBe(0); // Sunday
    expect(dueDate.lte.getHours()).toBe(23);
    expect(dueDate.lte.getMinutes()).toBe(59);
    expect(dueDate.lte.getSeconds()).toBe(59);
    expect(dueDate.lte.getMilliseconds()).toBe(999);
  });

  it('caps dueDateFilter=this_month to the last day of the current month at 23:59:59.999', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      dueDateFilter: 'this_month',
    });

    // Assert — upper bound is end-of-month (23:59:59.999).
    const findManyCall = (mockPrisma.ticket.findMany as jest.Mock).mock.calls[0][0];
    const dueDate = findManyCall.where.dueDate as { gte: Date; lte: Date };
    expect(dueDate.lte.getHours()).toBe(23);
    expect(dueDate.lte.getMinutes()).toBe(59);
    expect(dueDate.lte.getSeconds()).toBe(59);
    expect(dueDate.lte.getMilliseconds()).toBe(999);
    // The `to` date must be later in time than the `from` date.
    expect(dueDate.lte.getTime()).toBeGreaterThan(dueDate.gte.getTime());
  });

  it('prefers raw dueDateFrom/dueDateTo over the convenience enum when both are provided', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act — raw range covers a different window than the "overdue" enum.
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-12-31T23:59:59.999Z');
    await listTickets(USER_ID, PROJECT_ID, {
      page: 1,
      pageSize: 50,
      dueDateFrom: from,
      dueDateTo: to,
      dueDateFilter: 'overdue',
    });

    // Assert — raw range wins; `where.dueDate` is gte/lte, NOT `lt: now`.
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dueDate: { gte: from, lte: to },
        }),
      }),
    );
  });

  it('does not add a dueDate clause when no due-date filter is provided', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    await listTickets(USER_ID, PROJECT_ID, { page: 1, pageSize: 50 });

    // Assert — where still only constrains projectId.
    const findManyCall = (mockPrisma.ticket.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.dueDate).toBeUndefined();
    expect(findManyCall.where.projectId).toBe(PROJECT_ID);
  });

  it('returns blockedBy: true when a BLOCKS link targets the ticket (targetLinks)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      {
        id: TICKET_ID,
        number: 7,
        statusColumnId: COLUMN_ID,
        assigneeId: null,
        reporterId: USER_ID,
        projectId: PROJECT_ID,
        title: 'Blocked',
        description: null,
        priority: 'NONE',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        dueDate: null,
        assignee: null,
        reporter: { id: USER_ID, displayName: 'u', avatarUrl: null },
        statusColumn: { id: COLUMN_ID, name: 'Todo', position: 0 },
        labels: [],
        targetLinks: [{ id: 'link-uuid-1' }],
      },
    ]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(1);

    // Act
    const result = await listTickets(USER_ID, PROJECT_ID, { page: 1, pageSize: 50 });

    // Assert
    expect(result.tickets[0].blockedBy).toBe(true);
    // The raw include shape is stripped from the serialized output.
    expect((result.tickets[0] as Record<string, unknown>).targetLinks).toBeUndefined();
  });

  it('returns blockedBy: false when targetLinks is empty', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      {
        id: TICKET_ID,
        number: 8,
        statusColumnId: COLUMN_ID,
        assigneeId: null,
        reporterId: USER_ID,
        projectId: PROJECT_ID,
        title: 'Not blocked',
        description: null,
        priority: 'NONE',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        dueDate: null,
        assignee: null,
        reporter: { id: USER_ID, displayName: 'u', avatarUrl: null },
        statusColumn: { id: COLUMN_ID, name: 'Todo', position: 0 },
        labels: [],
        targetLinks: [],
      },
    ]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(1);

    // Act
    const result = await listTickets(USER_ID, PROJECT_ID, { page: 1, pageSize: 50 });

    // Assert
    expect(result.tickets[0].blockedBy).toBe(false);
  });

  it('does NOT set blockedBy when the BLOCKS link is on sourceLinks (only targetLinks counts)', async () => {
    // Arrange — sourceLinks represent "this ticket blocks another"; they must
    // not flip the blockedBy flag on the source ticket itself.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      {
        id: TICKET_ID,
        number: 9,
        statusColumnId: COLUMN_ID,
        assigneeId: null,
        reporterId: USER_ID,
        projectId: PROJECT_ID,
        title: 'Blocks another',
        description: null,
        priority: 'NONE',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        dueDate: null,
        assignee: null,
        reporter: { id: USER_ID, displayName: 'u', avatarUrl: null },
        statusColumn: { id: COLUMN_ID, name: 'Todo', position: 0 },
        labels: [],
        targetLinks: [],
      },
    ]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(1);

    // Act
    const result = await listTickets(USER_ID, PROJECT_ID, { page: 1, pageSize: 50 });

    // Assert — no incoming BLOCKS → flag stays false.
    expect(result.tickets[0].blockedBy).toBe(false);
  });
});

// ─── overdue timer ─────────────────────────────────────────────────────────────

describe('overdue timer', () => {
  // Use fake timers so setTimeout is deterministic across tests.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper: arrange the standard createTicket prerequisites and return the
  // mock factories so each test can tweak dueDate / activityLog behaviour.
  function arrangeCreate(dueDate: Date | null) {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue({
      id: COLUMN_ID,
      projectId: PROJECT_ID,
    });
    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ next_number: 1 }]);
    (mockPrisma.ticket.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: TICKET_ID,
      ...data,
    }));
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});
    return { dueDate };
  }

  // Helper: arrange updateTicket with a fixed current ticket and a controllable
  // post-update return shape.
  function arrangeUpdate(currentDueDate: Date | null, updatedDueDate: Date | null) {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      title: 'Title',
      description: null,
      statusColumnId: COLUMN_ID,
      priority: 'NONE',
      assigneeId: null,
      dueDate: currentDueDate,
    });
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      dueDate: updatedDueDate,
    });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});
  }

  // Helper: arrange deleteTicket.
  function arrangeDelete(dueDate: Date | null, assigneeId: string | null = null) {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId,
      dueDate,
    });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.ticket.delete as jest.Mock).mockResolvedValue({});
  }

  // The broadcast helper that matches the production call site.
  const overdueBroadcasts = () =>
    (broadcast as jest.Mock).mock.calls.filter(c => c[1] === 'ticket.overdue');

  it('schedules a timer when createTicket receives a future dueDate', async () => {
    // Arrange
    arrangeCreate(new Date(Date.now() + 60_000));

    // Act
    await createTicket(USER_ID, PROJECT_ID, { ...BASE_INPUT, dueDate: '2099-01-01T00:00:00.000Z' });

    // Assert — setTimeout was scheduled, no immediate broadcast.
    expect(jest.getTimerCount()).toBe(1);
    expect(overdueBroadcasts()).toHaveLength(0);
  });

  it('broadcasts ticket.overdue immediately when createTicket receives a past dueDate', async () => {
    // Arrange
    arrangeCreate(new Date(Date.now() - 1000));

    // Act
    await createTicket(USER_ID, PROJECT_ID, { ...BASE_INPUT, dueDate: '2000-01-01T00:00:00.000Z' });

    // Assert — no timer stored, broadcast went out with the right payload.
    expect(jest.getTimerCount()).toBe(0);
    expect(overdueBroadcasts()).toEqual([
      [PROJECT_ID, 'ticket.overdue', { ticket: { id: TICKET_ID, projectId: PROJECT_ID } }],
    ]);
  });

  it('does not schedule a timer when createTicket receives no dueDate', async () => {
    // Arrange
    arrangeCreate(null);

    // Act
    await createTicket(USER_ID, PROJECT_ID, BASE_INPUT);

    // Assert
    expect(jest.getTimerCount()).toBe(0);
    expect(overdueBroadcasts()).toHaveLength(0);
  });

  it('cancels the old timer and schedules a new one when updateTicket changes dueDate', async () => {
    // Arrange — current ticket has a far-future dueDate, the update moves it to
    // a different future moment. We assert the timer count stays at 1 (cancel
    // + reschedule) and that no overdue broadcast fires yet.
    arrangeUpdate(new Date('2099-01-01T00:00:00.000Z'), new Date('2099-02-01T00:00:00.000Z'));

    // Act
    await updateTicket(USER_ID, PROJECT_ID, 42, { dueDate: '2099-02-01T00:00:00.000Z' });

    // Assert — exactly one pending timer (the new schedule).
    expect(jest.getTimerCount()).toBe(1);
    expect(overdueBroadcasts()).toHaveLength(0);
  });

  it('cancels the timer when updateTicket clears dueDate to null', async () => {
    // Arrange — current ticket has a future dueDate, update clears it.
    arrangeUpdate(new Date('2099-01-01T00:00:00.000Z'), null);

    // Act
    await updateTicket(USER_ID, PROJECT_ID, 42, { dueDate: null });

    // Assert — no pending timer, no overdue broadcast.
    expect(jest.getTimerCount()).toBe(0);
    expect(overdueBroadcasts()).toHaveLength(0);
  });

  it('does not touch the timer when updateTicket is called without dueDate in the input', async () => {
    // Arrange — the existing ticket has no dueDate, update only changes title.
    arrangeUpdate(null, null);

    // Act
    await updateTicket(USER_ID, PROJECT_ID, 42, { title: 'New title' });

    // Assert
    expect(jest.getTimerCount()).toBe(0);
    expect(overdueBroadcasts()).toHaveLength(0);
  });

  it('cancels the timer when deleteTicket removes a ticket', async () => {
    // Arrange — ticket exists with a future dueDate (a timer would be live),
    // and we simulate that by scheduling one manually first.
    arrangeDelete(new Date('2099-01-01T00:00:00.000Z'));
    // Pre-seed a timer so we can observe cancellation on delete.
    (mockPrisma.ticket.create as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      projectId: PROJECT_ID,
      dueDate: new Date('2099-01-01T00:00:00.000Z'),
    });
    await createTicket(USER_ID, PROJECT_ID, {
      ...BASE_INPUT,
      dueDate: '2099-01-01T00:00:00.000Z',
    });
    expect(jest.getTimerCount()).toBe(1);

    // Act
    await deleteTicket(USER_ID, PROJECT_ID, 42);

    // Assert — timer was cancelled, no overdue broadcast.
    expect(jest.getTimerCount()).toBe(0);
    expect(overdueBroadcasts()).toHaveLength(0);
  });

  it('rehydrateOverdueTimers schedules timers for tickets with future dueDate', async () => {
    // Arrange — rehydrate should query for dueDate > now. Already-past-due
    // tickets are not re-broadcast here; they surface via DueDateBadge on
    // the next board load. (The DB filter `dueDate > now` ensures only
    // future rows come back, so the mock only returns future rows.)
    const futureId1 = 'ticket-uuid-future-1';
    const futureId2 = 'ticket-uuid-future-2';
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([
      { id: futureId1, projectId: PROJECT_ID, dueDate: new Date(Date.now() + 60_000) },
      { id: futureId2, projectId: OTHER_PROJECT_ID, dueDate: new Date(Date.now() + 120_000) },
    ]);

    // Act
    await rehydrateOverdueTimers();

    // Assert — exactly one timer per future row, no immediate broadcasts
    // (these are future-due, so the timer is armed but hasn't fired yet).
    expect(jest.getTimerCount()).toBe(2);
    expect(overdueBroadcasts()).toHaveLength(0);
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dueDate: { gt: expect.any(Date) } },
        take: 1000,
      }),
    );
  });

  it('rehydrateOverdueTimers is a no-op when no tickets match', async () => {
    // Arrange
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);

    // Act
    await rehydrateOverdueTimers();

    // Assert
    expect(jest.getTimerCount()).toBe(0);
    expect(overdueBroadcasts()).toHaveLength(0);
  });
});

// ─── bulkUpdate ───────────────────────────────────────────────────────────────

const NEW_COLUMN_ID = 'col-uuid-new';
const ASSIGNEE_ID = 'user-uuid-assignee';

const baseTicket = (overrides: Record<string, unknown> = {}) => ({
  id: TICKET_ID,
  number: 1,
  projectId: PROJECT_ID,
  title: 'Bulk ticket',
  description: null,
  priority: 'NONE' as const,
  statusColumnId: COLUMN_ID,
  assigneeId: null,
  reporterId: USER_ID,
  dueDate: null,
  sortOrder: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  assignee: null,
  reporter: { id: USER_ID, name: 'Rep', email: 'rep@x.com', avatarUrl: null },
  statusColumn: { id: COLUMN_ID, name: 'Todo', position: 0 },
  labels: [],
  targetLinks: [],
  ...overrides,
});

const setupMembership = (role: 'OWNER' | 'MEMBER' | 'VIEWER' = 'MEMBER') => {
  (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
    ...MEMBER_MEMBERSHIP,
    role,
  });
  (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
};

describe('bulkUpdate', () => {
  it('throws 403 when role is VIEWER', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MEMBER_MEMBERSHIP,
      role: 'VIEWER',
    });

    await expect(
      bulkUpdate(USER_ID, PROJECT_ID, {
        ticketNumbers: [1],
        operation: 'status',
        value: NEW_COLUMN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('throws 403 when user is not a member of the project', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      bulkUpdate(USER_ID, PROJECT_ID, {
        ticketNumbers: [1],
        operation: 'delete',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('throws 400 when project is archived', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      archivedAt: new Date('2024-02-01'),
    });

    await expect(
      bulkUpdate(USER_ID, PROJECT_ID, {
        ticketNumbers: [1],
        operation: 'status',
        value: NEW_COLUMN_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot modify an archived project',
    });
  });

  it('updates status across multiple tickets, writes logs, and broadcasts in order', async () => {
    setupMembership();
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue({
      id: NEW_COLUMN_ID,
      projectId: PROJECT_ID,
    });
    // t1 starts in COLUMN_ID (the new column) → no-op, no log.
    // t2 starts in a different column → will log.
    const t1 = baseTicket({ id: 'ticket-a', number: 1, statusColumnId: NEW_COLUMN_ID });
    const t2 = baseTicket({ id: 'ticket-b', number: 2, statusColumnId: COLUMN_ID });
    const t3 = baseTicket({ id: 'ticket-c', number: 3, statusColumnId: 'col-uuid-other' });
    (mockPrisma.ticket.findMany as jest.Mock)
      .mockResolvedValueOnce([t1, t2, t3]) // resolve
      .mockResolvedValueOnce([t1, t2, t3]); // reload after update
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [1, 2, 3],
      operation: 'status',
      value: NEW_COLUMN_ID,
    });

    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ticket-a', 'ticket-b', 'ticket-c'] } },
      data: { statusColumnId: NEW_COLUMN_ID },
    });
    // Only t2 and t3 had a real change; t1 is a no-op.
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(2);
    // Broadcasts go out in resolved (input) order, with `ticket.updated` envelopes.
    const broadcasts = (broadcast as jest.Mock).mock.calls.filter(
      (c) => c[1] === 'ticket.updated',
    );
    expect(broadcasts).toHaveLength(3);
    expect(broadcasts.map((b) => b[0])).toEqual([PROJECT_ID, PROJECT_ID, PROJECT_ID]);
    expect(broadcasts.map((b) => b[2].ticket.id)).toEqual(['ticket-a', 'ticket-b', 'ticket-c']);
    expect(result).toMatchObject({ updated: 3 });
    expect(result.tickets).toHaveLength(3);
  });

  it('updates priority across multiple tickets and writes priority_changed logs', async () => {
    setupMembership();
    const t1 = baseTicket({ id: 'ticket-a', number: 1, priority: 'LOW' });
    const t2 = baseTicket({ id: 'ticket-b', number: 2, priority: 'MEDIUM' });
    (mockPrisma.ticket.findMany as jest.Mock)
      .mockResolvedValueOnce([t1, t2])
      .mockResolvedValueOnce([t1, t2]);
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [1, 2],
      operation: 'priority',
      value: 'HIGH',
    });

    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { priority: 'HIGH' } }),
    );
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'priority_changed', newValue: 'HIGH' }),
      }),
    );
    expect(result).toMatchObject({ updated: 2 });
  });

  it('assigns a member and writes "assigned" log; UNASSIGN writes "unassigned"', async () => {
    setupMembership();
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(MEMBER_MEMBERSHIP) // role check
      .mockResolvedValueOnce({ ...MEMBER_MEMBERSHIP, userId: ASSIGNEE_ID }); // assignee lookup
    const t1 = baseTicket({ id: 'ticket-a', number: 1, assigneeId: null });
    const t2 = baseTicket({ id: 'ticket-b', number: 2, assigneeId: ASSIGNEE_ID });
    (mockPrisma.ticket.findMany as jest.Mock)
      .mockResolvedValueOnce([t1, t2])
      .mockResolvedValueOnce([t1, t2]);
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [1, 2],
      operation: 'assignee',
      value: ASSIGNEE_ID,
    });

    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assigneeId: ASSIGNEE_ID } }),
    );
    // t2 already had this assignee → no log; t1 → "assigned".
    const actions = (mockPrisma.activityLog.create as jest.Mock).mock.calls.map(
      (c) => c[0].data.action,
    );
    expect(actions).toEqual(['assigned']);
    expect(result).toMatchObject({ updated: 2 });
  });

  it('handles UNASSIGN by setting assigneeId to null and writing "unassigned"', async () => {
    setupMembership();
    const t1 = baseTicket({ id: 'ticket-a', number: 1, assigneeId: ASSIGNEE_ID });
    (mockPrisma.ticket.findMany as jest.Mock)
      .mockResolvedValueOnce([t1])
      .mockResolvedValueOnce([t1]);
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [1],
      operation: 'assignee',
      value: 'UNASSIGN',
    });

    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assigneeId: null } }),
    );
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'unassigned' }),
      }),
    );
    expect(result).toMatchObject({ updated: 1 });
  });

  it('throws 400 when assignee value is not a member of the project', async () => {
    setupMembership();
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(MEMBER_MEMBERSHIP) // role
      .mockResolvedValueOnce(null); // assignee lookup miss
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValueOnce([baseTicket()]);

    await expect(
      bulkUpdate(USER_ID, PROJECT_ID, {
        ticketNumbers: [1],
        operation: 'assignee',
        value: 'not-a-member-uuid',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('adds a label to multiple tickets, writes label_added logs only for newly added', async () => {
    setupMembership();
    (mockPrisma.label.findFirst as jest.Mock).mockResolvedValue({
      id: LABEL_ID,
      projectId: PROJECT_ID,
      name: 'bug',
    });
    const t1 = baseTicket({ id: 'ticket-a', number: 1 });
    const t2 = baseTicket({
      id: 'ticket-b',
      number: 2,
      labels: [{ label: { id: LABEL_ID, name: 'bug', color: '#f00' } }],
    });
    const t3 = baseTicket({ id: 'ticket-c', number: 3 });
    (mockPrisma.ticketLabel.createMany as jest.Mock).mockResolvedValue({ count: 2 });
    // Reload after addLabel returns tickets that now have the label.
    (mockPrisma.ticket.findMany as jest.Mock)
      .mockResolvedValueOnce([t1, t2, t3]) // resolve
      .mockResolvedValueOnce([t1, t2, t3]); // reload (after createMany)
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [1, 2, 3],
      operation: 'addLabel',
      value: LABEL_ID,
    });

    expect(mockPrisma.ticketLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { ticketId: 'ticket-a', labelId: LABEL_ID },
          { ticketId: 'ticket-b', labelId: LABEL_ID },
          { ticketId: 'ticket-c', labelId: LABEL_ID },
        ],
        skipDuplicates: true,
      }),
    );
    // t2 already had the label → no log. t1 and t3 → 2 logs.
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ updated: 3 });
  });

  it('removes a label, only touching rows that had the label and writing label_removed per row', async () => {
    setupMembership();
    (mockPrisma.label.findFirst as jest.Mock).mockResolvedValue({
      id: LABEL_ID,
      projectId: PROJECT_ID,
      name: 'bug',
    });
    const t1 = baseTicket({
      id: 'ticket-a',
      number: 1,
      labels: [{ label: { id: LABEL_ID, name: 'bug', color: '#f00' } }],
    });
    const t2 = baseTicket({ id: 'ticket-b', number: 2 });
    (mockPrisma.ticketLabel.findMany as jest.Mock).mockResolvedValue([
      { ticketId: 'ticket-a', labelId: LABEL_ID, label: { id: LABEL_ID, name: 'bug' } },
    ]);
    (mockPrisma.ticketLabel.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValueOnce([t1, t2]); // reload
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [1, 2],
      operation: 'removeLabel',
      value: LABEL_ID,
    });

    expect(mockPrisma.ticketLabel.deleteMany).toHaveBeenCalledWith({
      where: { ticketId: { in: ['ticket-a', 'ticket-b'] }, labelId: LABEL_ID },
    });
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'label_removed',
          ticketId: 'ticket-a',
          oldValue: 'bug',
        }),
      }),
    );
    expect(result).toMatchObject({ updated: 2 });
  });

  it('deletes multiple tickets atomically, writes "deleted" logs BEFORE deleteMany in the same tx', async () => {
    setupMembership();
    const t1 = baseTicket({ id: 'ticket-a', number: 1 });
    const t2 = baseTicket({ id: 'ticket-b', number: 2 });
    const t3 = baseTicket({ id: 'ticket-c', number: 3 });
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValueOnce([t1, t2, t3]);
    const callOrder: string[] = [];
    (mockPrisma.activityLog.create as jest.Mock).mockImplementation(async () => {
      callOrder.push('log');
      return {};
    });
    (mockPrisma.ticket.deleteMany as jest.Mock).mockImplementation(async () => {
      callOrder.push('delete');
      return { count: 3 };
    });

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [1, 2, 3],
      operation: 'delete',
    });

    // 3 logs then 1 deleteMany, all inside the $transaction.
    expect(callOrder).toEqual(['log', 'log', 'log', 'delete']);
    expect(mockPrisma.activityLog.create).toHaveBeenCalledTimes(3);
    expect(mockPrisma.ticket.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['ticket-a', 'ticket-b', 'ticket-c'] } },
    });
    expect(result).toEqual({ deleted: 3, ticketNumbers: [1, 2, 3] });

    // Broadcasts: one per deleted ticket, in resolved order, shape { ticketId, number }.
    const deletes = (broadcast as jest.Mock).mock.calls.filter(
      (c) => c[1] === 'ticket.deleted',
    );
    expect(deletes.map((d) => d[2])).toEqual([
      { ticketId: 'ticket-a', number: 1 },
      { ticketId: 'ticket-b', number: 2 },
      { ticketId: 'ticket-c', number: 3 },
    ]);
  });

  it('silently skips unknown ticket numbers and counts only resolved ones', async () => {
    setupMembership();
    const t1 = baseTicket({ id: 'ticket-a', number: 1 });
    const t2 = baseTicket({ id: 'ticket-b', number: 2 });
    // Resolve returns only 1 and 2; 999 not found.
    (mockPrisma.ticket.findMany as jest.Mock)
      .mockResolvedValueOnce([t1, t2])
      .mockResolvedValueOnce([t1, t2]);
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [1, 2, 999],
      operation: 'priority',
      value: 'HIGH',
    });

    expect(result).toMatchObject({ updated: 2 });
    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['ticket-a', 'ticket-b'] } },
      }),
    );
  });

  it('returns { updated: 0 } when none of the requested numbers exist', async () => {
    setupMembership();
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValueOnce([]);

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [9999],
      operation: 'priority',
      value: 'HIGH',
    });

    expect(result).toEqual({ updated: 0, tickets: [] });
    expect(mockPrisma.ticket.updateMany).not.toHaveBeenCalled();
  });

  it('throws 400 when status column does not belong to the project', async () => {
    setupMembership();
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValueOnce([baseTicket()]);

    await expect(
      bulkUpdate(USER_ID, PROJECT_ID, {
        ticketNumbers: [1],
        operation: 'status',
        value: NEW_COLUMN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.ticket.updateMany).not.toHaveBeenCalled();
  });

  it('throws 400 (and rejects the whole batch) when bulk-moving to in progress and any ticket is unassigned', async () => {
    setupMembership();
    // Target column is "in progress".
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue({
      id: NEW_COLUMN_ID,
      projectId: PROJECT_ID,
      name: 'in_progress',
    });
    // Two tickets resolved: one assigned, one unassigned.
    const assigned = baseTicket({ id: 'ticket-a', number: 1, assigneeId: ASSIGNEE_ID });
    const unassigned = baseTicket({ id: 'ticket-b', number: 2, assigneeId: null });
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValueOnce([assigned, unassigned]);

    await expect(
      bulkUpdate(USER_ID, PROJECT_ID, {
        ticketNumbers: [1, 2],
        operation: 'status',
        value: NEW_COLUMN_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot move an unassigned ticket to "in progress"',
    });
    expect(mockPrisma.ticket.updateMany).not.toHaveBeenCalled();
  });

  it('proceeds with bulk-moving to in progress when every ticket has an assignee', async () => {
    setupMembership();
    // Target column is "in progress".
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue({
      id: NEW_COLUMN_ID,
      projectId: PROJECT_ID,
      name: 'in_progress',
    });
    const t1 = baseTicket({ id: 'ticket-a', number: 1, assigneeId: ASSIGNEE_ID });
    const t2 = baseTicket({ id: 'ticket-b', number: 2, assigneeId: ASSIGNEE_ID });
    (mockPrisma.ticket.findMany as jest.Mock)
      .mockResolvedValueOnce([t1, t2]) // resolve
      .mockResolvedValueOnce([t1, t2]); // reload
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    const result = await bulkUpdate(USER_ID, PROJECT_ID, {
      ticketNumbers: [1, 2],
      operation: 'status',
      value: NEW_COLUMN_ID,
    });

    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['ticket-a', 'ticket-b'] } },
      data: { statusColumnId: NEW_COLUMN_ID },
    });
    expect(result).toMatchObject({ updated: 2 });
  });
});

// ─── listAttachments (narrow select, no bytes) ────────────────────────────────
//
// listAttachments returns the metadata that the frontend board needs to render
// thumbnails / links. The raw bytes are fetched lazily by the GET .../raw
// endpoint, so listAttachments MUST use a select that omits `bytes` — otherwise
// every list call ships every BYTEA payload and the board becomes unbounded.

describe('listAttachments — narrow select', () => {
  it('calls prisma.ticketAttachment.findMany with a select that does NOT contain bytes', async () => {
    // Arrange — caller is a project member, ticket resolves.
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue({
      role: 'MEMBER',
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 7,
      projectId: PROJECT_ID,
    });
    (mockPrisma.ticketAttachment.findMany as jest.Mock).mockResolvedValue([]);

    // Act
    await listAttachments(USER_ID, PROJECT_ID, 7);

    // Assert — captured findMany call args must use a select (not an include),
    // and that select must omit `bytes` so the BYTEA payload stays out of the
    // list response. Pattern: `select: expect.not.objectContaining({ bytes: ... })`.
    expect(mockPrisma.ticketAttachment.findMany).toHaveBeenCalledTimes(1);
    const callArg = (mockPrisma.ticketAttachment.findMany as jest.Mock).mock.calls[0][0];
    expect(callArg).toEqual(
      expect.objectContaining({
        select: expect.not.objectContaining({ bytes: expect.anything() }),
      }),
    );
  });
});
