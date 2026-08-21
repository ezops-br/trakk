// @ts-nocheck
// Mock prisma before importing the service.
jest.mock('../lib/prisma', () => {
  const db = {
    $transaction: jest.fn(),
    projectMember: {
      findFirst: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    label: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    ticketLabel: {
      deleteMany: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(async (cb) => cb(db));
  return { prisma: db };
});

import { prisma } from '../lib/prisma';
import { createLabel, deleteLabel } from './label.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = 'user-uuid-1';
const PROJECT_ID = 'proj-uuid-1';
const LABEL_ID = 'label-uuid-1';

const OWNER_MEMBERSHIP = {
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'OWNER' as const,
  joinedAt: new Date('2024-01-01'),
};

beforeEach(() => {
  jest.clearAllMocks();
  // Restore $transaction pass-through after clearAllMocks wipes implementations.
  (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(mockPrisma));
});

// ─── createLabel ──────────────────────────────────────────────────────────────

describe('createLabel', () => {
  it('throws 400 when the color is not a valid 6-digit hex value', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(OWNER_MEMBERSHIP);

    // Act & Assert — "red" fails the ^#[0-9A-Fa-f]{6}$ guard
    await expect(
      createLabel(USER_ID, PROJECT_ID, { name: 'Bug', color: 'red' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.label.create).not.toHaveBeenCalled();
  });

  it('throws 403 when a non-OWNER attempts to create a label', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...OWNER_MEMBERSHIP,
      role: 'MEMBER',
    });

    // Act & Assert
    await expect(
      createLabel(USER_ID, PROJECT_ID, { name: 'Bug', color: '#FF0000' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.label.create).not.toHaveBeenCalled();
  });
});

// ─── deleteLabel ──────────────────────────────────────────────────────────────

describe('deleteLabel', () => {
  it('removes ticket associations then deletes the label atomically', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(OWNER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      archivedAt: null,
    });
    (mockPrisma.label.findFirst as jest.Mock).mockResolvedValue({
      id: LABEL_ID,
      projectId: PROJECT_ID,
    });
    (mockPrisma.ticketLabel.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.label.delete as jest.Mock).mockResolvedValue({ id: LABEL_ID });

    // Act
    await deleteLabel(USER_ID, PROJECT_ID, LABEL_ID);

    // Assert — join rows removed first, then the label, inside a transaction
    expect(mockPrisma.ticketLabel.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ labelId: LABEL_ID }) }),
    );
    expect(mockPrisma.label.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: LABEL_ID } }),
    );
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
