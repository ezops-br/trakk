// @ts-nocheck
// Mock prisma before importing the service.
// $transaction passes the same mock object as tx so assertions work whether the
// call is made on top-level prisma or inside a transaction.
jest.mock('../lib/prisma', () => {
  const db = {
    $transaction: jest.fn(),
    projectMember: {
      findFirst: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    statusColumn: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    ticket: {
      updateMany: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(async (cb) => cb(db));
  return { prisma: db };
});

import { prisma } from '../lib/prisma';
import {
  listColumns,
  createColumn,
  updateColumn,
  deleteColumn,
} from './column.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = 'user-uuid-1';
const PROJECT_ID = 'proj-uuid-1';
const OTHER_PROJECT_ID = 'proj-uuid-2';
const COLUMN_ID = 'col-uuid-1';
const TARGET_COLUMN_ID = 'col-uuid-2';

const OWNER_MEMBERSHIP = {
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'OWNER' as const,
  joinedAt: new Date('2024-01-01'),
};

const ACTIVE_PROJECT = { id: PROJECT_ID, archivedAt: null };

beforeEach(() => {
  jest.clearAllMocks();
  // Restore $transaction pass-through after clearAllMocks wipes implementations.
  (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(mockPrisma));
});

// ─── listColumns ────────────────────────────────────────────────────────────

describe('listColumns', () => {
  it('returns columns ordered by position asc for any project member', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...OWNER_MEMBERSHIP,
      role: 'VIEWER',
    });
    const cols = [
      { id: 'a', projectId: PROJECT_ID, name: 'To Do', position: 0 },
      { id: 'b', projectId: PROJECT_ID, name: 'Done', position: 1 },
    ];
    (mockPrisma.statusColumn.findMany as jest.Mock).mockResolvedValue(cols);

    // Act
    const result = await listColumns(USER_ID, PROJECT_ID);

    // Assert
    expect(result).toHaveLength(2);
    expect(mockPrisma.statusColumn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: PROJECT_ID },
        orderBy: { position: 'asc' },
      }),
    );
  });

  it('throws 403 when the requester is not a project member', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(listColumns('non-member', PROJECT_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.statusColumn.findMany).not.toHaveBeenCalled();
  });
});

// ─── createColumn ───────────────────────────────────────────────────────────

describe('createColumn', () => {
  it('OWNER creates a column with an auto-incremented position', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(OWNER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    // Existing max position is 2, so the new column should land at 3.
    (mockPrisma.statusColumn.aggregate as jest.Mock).mockResolvedValue({ _max: { position: 2 } });
    (mockPrisma.statusColumn.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: 'new-col',
      ...data,
    }));

    // Act
    const result = await createColumn(USER_ID, PROJECT_ID, 'In Review');

    // Assert
    expect(mockPrisma.statusColumn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: PROJECT_ID, name: 'In Review', position: 3 }),
      }),
    );
    expect(result).toMatchObject({ name: 'In Review', position: 3 });
  });

  it('throws 403 when a non-OWNER attempts to create a column', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...OWNER_MEMBERSHIP,
      role: 'MEMBER',
    });

    // Act & Assert
    await expect(createColumn(USER_ID, PROJECT_ID, 'In Review')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.statusColumn.create).not.toHaveBeenCalled();
  });

  it('throws 400 when the project is archived (archived guard)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(OWNER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      archivedAt: new Date('2024-02-01'),
    });

    // Act & Assert
    await expect(createColumn(USER_ID, PROJECT_ID, 'In Review')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.statusColumn.create).not.toHaveBeenCalled();
  });
});

// ─── updateColumn ───────────────────────────────────────────────────────────

describe('updateColumn', () => {
  it('throws 400 when no updatable field is provided', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(OWNER_MEMBERSHIP);

    // Act & Assert — empty payload is rejected before any write
    await expect(updateColumn(USER_ID, PROJECT_ID, COLUMN_ID, {})).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockPrisma.statusColumn.update).not.toHaveBeenCalled();
  });
});

// ─── deleteColumn ───────────────────────────────────────────────────────────

describe('deleteColumn', () => {
  it('migrates tickets then deletes the column atomically', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(OWNER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.statusColumn.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: COLUMN_ID, projectId: PROJECT_ID }) // column to delete
      .mockResolvedValueOnce({ id: TARGET_COLUMN_ID, projectId: PROJECT_ID }); // migration target
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
    (mockPrisma.statusColumn.delete as jest.Mock).mockResolvedValue({ id: COLUMN_ID });

    // Act
    await deleteColumn(USER_ID, PROJECT_ID, COLUMN_ID, TARGET_COLUMN_ID);

    // Assert — tickets reassigned to the target, then the column removed
    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ statusColumnId: COLUMN_ID }),
        data: { statusColumnId: TARGET_COLUMN_ID },
      }),
    );
    expect(mockPrisma.statusColumn.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COLUMN_ID } }),
    );
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('throws 400 when the migration target belongs to a different project', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(OWNER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(ACTIVE_PROJECT);
    (mockPrisma.statusColumn.findFirst as jest.Mock)
      .mockResolvedValueOnce({ id: COLUMN_ID, projectId: PROJECT_ID }) // column to delete
      .mockResolvedValueOnce({ id: TARGET_COLUMN_ID, projectId: OTHER_PROJECT_ID }); // wrong project

    // Act & Assert
    await expect(
      deleteColumn(USER_ID, PROJECT_ID, COLUMN_ID, TARGET_COLUMN_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.statusColumn.delete).not.toHaveBeenCalled();
  });
});
