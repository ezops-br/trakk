// @ts-nocheck
const mockBroadcast = jest.fn();
const mockBroadcastToDashboard = jest.fn();
const mockDeleteCalendarEvent = jest.fn();
const mockGetRefreshedAccessToken = jest.fn();

// Mock prisma before importing the service.
jest.mock('../lib/prisma', () => {
  const db = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    projectMember: {
      findFirst: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    statusColumn: {
      findFirst: jest.fn(),
    },
    ticket: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    label: {
      findFirst: jest.fn(),
    },
    ticketLabel: {
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

jest.mock('../lib/event-broadcaster', () => ({ broadcast: mockBroadcast }));
jest.mock('../lib/dashboard-event-broadcaster', () => ({
  broadcastToDashboard: mockBroadcastToDashboard,
}));
jest.mock('./google-calendar.service', () => ({
  deleteCalendarEvent: mockDeleteCalendarEvent,
}));
jest.mock('./google-oauth.service', () => ({
  getRefreshedAccessToken: mockGetRefreshedAccessToken,
}));

import { prisma } from '../lib/prisma';
import {
  listTickets,
  createTicket,
  getTicketByNumber,
  updateTicket,
  deleteTicket,
  toggleArchiveTicket,
  reorderTickets,
  addLabelToTicket,
  removeLabelFromTicket,
} from './ticket.service';

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
const ARCHIVED_PROJECT = { id: PROJECT_ID, archivedAt: new Date('2024-02-01') };

// prisma.project.findUnique serves two different callers:
//   - assertProjectNotArchived  → select { id, archivedAt }
//   - createTicket number alloc → select { nextTicketNumber }
// Route each by the requested select so a single mock can serve both.
function mockProjectLookups(opts: { archivedAt?: Date | null; nextTicketNumber?: number } = {}) {
  const { archivedAt = null, nextTicketNumber = 1 } = opts;
  (mockPrisma.project.findUnique as jest.Mock).mockImplementation(async (args) => {
    if (args?.select?.nextTicketNumber) {
      return { nextTicketNumber };
    }
    return { id: PROJECT_ID, archivedAt };
  });
  (mockPrisma.project.update as jest.Mock).mockResolvedValue({ id: PROJECT_ID });
}

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
  it('never reuses a ticket number: allocates from project.nextTicketNumber and increments it', async () => {
    // Arrange — the highest surviving ticket is #3 because #4..#7 were hard
    // deleted, but the project counter has advanced to 8. MAX(number)+1 would
    // wrongly reuse 4; the counter must win.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    mockProjectLookups({ nextTicketNumber: 8 });
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue({
      id: COLUMN_ID,
      projectId: PROJECT_ID,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({ sortOrder: 3000 });
    (mockPrisma.ticket.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: TICKET_ID,
      ...data,
    }));
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    const result = await createTicket(USER_ID, PROJECT_ID, BASE_INPUT);

    // Assert — number comes from the counter, and the counter is bumped.
    expect(result).toMatchObject({ number: 8, title: 'Fix login bug' });
    expect(mockPrisma.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 8 }) }),
    );
    expect(mockPrisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROJECT_ID },
        data: expect.objectContaining({ nextTicketNumber: { increment: 1 } }),
      }),
    );
  });

  it('writes a "created" activity log entry on success', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    mockProjectLookups({ nextTicketNumber: 1 });
    (mockPrisma.statusColumn.findFirst as jest.Mock).mockResolvedValue({
      id: COLUMN_ID,
      projectId: PROJECT_ID,
    });
    // Kept so this activity-log assertion is independent of how the ticket
    // number is allocated (raw MAX query before, project counter after).
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

// ─── listTickets ──────────────────────────────────────────────────────────────

describe('listTickets', () => {
  it('excludes archived tickets by adding archivedAt: null to the base where filter', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(0);

    // Act
    await listTickets(USER_ID, PROJECT_ID, {});

    // Assert — both the page query and the count query must be archive-filtered.
    expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: PROJECT_ID, archivedAt: null }),
      }),
    );
    expect(mockPrisma.ticket.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: null }),
      }),
    );
  });
});

// ─── toggleArchiveTicket ──────────────────────────────────────────────────────

const ARCHIVED_AT = new Date('2026-08-01T10:00:00.000Z');

describe('toggleArchiveTicket', () => {
  it('archives an active ticket: sets archivedAt to a timestamp and logs "archived"', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    mockProjectLookups();
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      archivedAt: null,
    });
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      archivedAt: ARCHIVED_AT,
      labels: [],
    });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    const result = await toggleArchiveTicket(USER_ID, PROJECT_ID, 42, true);

    // Assert
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ archivedAt: expect.any(Date) }),
      }),
    );
    expect(result.archivedAt).not.toBeNull();
    // normalizeTicket must have flattened the junction-table labels.
    expect(result.labels).toEqual([]);
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'archived',
          ticketId: TICKET_ID,
          userId: USER_ID,
        }),
      }),
    );
  });

  it('restores an archived ticket: sets archivedAt back to null and logs "restored"', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    mockProjectLookups();
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      archivedAt: ARCHIVED_AT,
    });
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      archivedAt: null,
      labels: [],
    });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    const result = await toggleArchiveTicket(USER_ID, PROJECT_ID, 42, false);

    // Assert
    expect(mockPrisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ archivedAt: null }),
      }),
    );
    expect(result.archivedAt).toBeNull();
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'restored' }) }),
    );
  });

  it('throws 403 for a VIEWER in both directions and never writes', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MEMBER_MEMBERSHIP,
      role: 'VIEWER',
    });
    mockProjectLookups();

    // Act & Assert
    await expect(toggleArchiveTicket(USER_ID, PROJECT_ID, 42, true)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(toggleArchiveTicket(USER_ID, PROJECT_ID, 42, false)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
    expect(mockPrisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('throws 403 when the caller is not a member of the project (project isolation)', async () => {
    // Arrange — no membership row for this user/project pair.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(
      toggleArchiveTicket(USER_ID, OTHER_PROJECT_ID, 42, true),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticket.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it('throws 400 when archiving inside an archived project', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    mockProjectLookups({ archivedAt: ARCHIVED_PROJECT.archivedAt });

    // Act & Assert
    await expect(toggleArchiveTicket(USER_ID, PROJECT_ID, 42, true)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it('allows restoring inside an archived project (archived-project guard is archive-only)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    mockProjectLookups({ archivedAt: ARCHIVED_PROJECT.archivedAt });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      archivedAt: ARCHIVED_AT,
    });
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      archivedAt: null,
      labels: [],
    });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    const result = await toggleArchiveTicket(USER_ID, PROJECT_ID, 42, false);

    // Assert — no 400, the restore goes through.
    expect(result.archivedAt).toBeNull();
    expect(mockPrisma.ticket.update).toHaveBeenCalled();
  });

  it('throws 404 when the ticket does not exist (restoring a hard-deleted ticket)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    mockProjectLookups();
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(toggleArchiveTicket(USER_ID, PROJECT_ID, 99, false)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it('never touches Google Calendar when archiving or restoring', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    mockProjectLookups();
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      archivedAt: null,
    });
    (mockPrisma.ticket.update as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      archivedAt: ARCHIVED_AT,
      labels: [],
    });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    await toggleArchiveTicket(USER_ID, PROJECT_ID, 42, true);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      assigneeId: null,
      archivedAt: ARCHIVED_AT,
    });
    await toggleArchiveTicket(USER_ID, PROJECT_ID, 42, false);

    // Assert — archiving is not a cancellation; Calendar events stay untouched.
    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
    expect(mockGetRefreshedAccessToken).not.toHaveBeenCalled();
  });
});

// ─── getTicketByNumber ──────────────────────────────────────────────────────

describe('getTicketByNumber', () => {
  it('still returns an archived ticket (no archivedAt filter on single-ticket fetch)', async () => {
    // Arrange — a stale-open detail sheet must be able to discover the archive state.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      archivedAt: ARCHIVED_AT,
      activityLogs: [],
    });

    // Act
    const result = await getTicketByNumber(USER_ID, PROJECT_ID, 42);

    // Assert
    expect(result.archivedAt).toEqual(ARCHIVED_AT);
    const where = (mockPrisma.ticket.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where).not.toHaveProperty('archivedAt');
  });

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
    });

    // Act
    await getTicketByNumber(USER_ID, PROJECT_ID, 42);

    // Assert — the include must request at most 50 activity log rows
    const callArg = (mockPrisma.ticket.findFirst as jest.Mock).mock.calls[0][0];
    expect(callArg.include.activityLogs.take).toBe(50);
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
});

describe('archived-ticket mutation guard', () => {
  beforeEach(() => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MEMBER_MEMBERSHIP);
    mockProjectLookups();
    // Every lookup resolves an archived ticket.
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue({
      id: TICKET_ID,
      number: 42,
      projectId: PROJECT_ID,
      title: 'Old title',
      description: null,
      statusColumnId: COLUMN_ID,
      priority: 'NONE',
      assigneeId: null,
      archivedAt: ARCHIVED_AT,
    });
    (mockPrisma.label.findFirst as jest.Mock).mockResolvedValue({
      id: LABEL_ID,
      name: 'bug',
      projectId: PROJECT_ID,
    });
    (mockPrisma.ticketLabel.findUnique as jest.Mock).mockResolvedValue({
      ticketId: TICKET_ID,
      labelId: LABEL_ID,
      label: { id: LABEL_ID, name: 'bug', color: '#fff' },
    });
  });

  it('updateTicket throws 400 on an archived ticket', async () => {
    // Act & Assert
    await expect(
      updateTicket(USER_ID, PROJECT_ID, 42, { title: 'New title' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
  });

  it('addLabelToTicket and removeLabelFromTicket throw 400 on an archived ticket', async () => {
    // Act & Assert
    await expect(
      addLabelToTicket(USER_ID, PROJECT_ID, 42, LABEL_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      removeLabelFromTicket(USER_ID, PROJECT_ID, 42, LABEL_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.ticketLabel.create).not.toHaveBeenCalled();
    expect(mockPrisma.ticketLabel.delete).not.toHaveBeenCalled();
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
    (mockPrisma.ticket.count as jest.Mock).mockResolvedValue(1);

    // Act & Assert
    await expect(reorderTickets(USER_ID, PROJECT_ID, updates)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.ticket.update).not.toHaveBeenCalled();
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
