// @ts-nocheck
import { Prisma } from '@prisma/client';

// Mock prisma before importing the service.
// $transaction is wired to pass the same mock object as tx so that
// assertions on mockPrisma.project.create etc. work regardless of
// whether the call is made on the top-level prisma or inside a transaction.
jest.mock('../lib/prisma', () => {
  const db = {
    $transaction: jest.fn(),
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    projectMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    statusColumn: {
      createMany: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(async (cb) => cb(db));
  return { prisma: db };
});

import { prisma } from '../lib/prisma';
import {
  listProjectsByUser,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  toggleArchiveProject,
} from './project.service';
import { AppError } from '../lib/app-error';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = 'user-uuid-1';
const PROJECT_ID = 'proj-uuid-1';

const MOCK_PROJECT = {
  id: PROJECT_ID,
  name: 'Trakk',
  key: 'TRAKK',
  description: null,
  archivedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const MOCK_MEMBER = {
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'OWNER' as const,
  joinedAt: new Date('2024-01-01'),
};

beforeEach(() => {
  jest.clearAllMocks();
  // Restore $transaction pass-through after clearAllMocks resets it.
  (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(mockPrisma));
});

// ─── listProjectsByUser ────────────────────────────────────────────────────

describe('listProjectsByUser', () => {
  it('returns array of active projects with role and memberCount for a member user', async () => {
    (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([
      {
        role: 'OWNER',
        project: {
          ...MOCK_PROJECT,
          _count: { members: 3 },
        },
      },
    ]);

    const result = await listProjectsByUser(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: PROJECT_ID,
      key: 'TRAKK',
      role: 'OWNER',
      memberCount: 3,
    });
  });

  it('returns empty array when user has no memberships', async () => {
    (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([]);

    const result = await listProjectsByUser(USER_ID);

    expect(result).toEqual([]);
  });
});

// ─── getProjectById ────────────────────────────────────────────────────────

describe('getProjectById', () => {
  it('returns project with role for a member user', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      ...MOCK_PROJECT,
      _count: { members: 2 },
    });

    const result = await getProjectById(PROJECT_ID, USER_ID);

    expect(result).toMatchObject({ id: PROJECT_ID, role: 'OWNER' });
  });

  it('throws 403 when user is not a member', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(getProjectById(PROJECT_ID, USER_ID)).rejects.toThrow(AppError);
    await expect(getProjectById(PROJECT_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('throws 404 when user is a member but project row does not exist', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(getProjectById(PROJECT_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ─── createProject ─────────────────────────────────────────────────────────

describe('createProject', () => {
  it('creates project, adds OWNER membership, creates 5 default status columns; returns project with role OWNER', async () => {
    (mockPrisma.project.create as jest.Mock).mockResolvedValue(MOCK_PROJECT);
    (mockPrisma.projectMember.create as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.statusColumn.createMany as jest.Mock).mockResolvedValue({ count: 5 });

    const result = await createProject(
      { name: 'Trakk', key: 'TRAKK', description: null },
      USER_ID,
    );

    expect(mockPrisma.project.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.projectMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'OWNER' }) }),
    );
    expect(mockPrisma.statusColumn.createMany).toHaveBeenCalledTimes(1);
    const createManyCall = (mockPrisma.statusColumn.createMany as jest.Mock).mock.calls[0][0];
    expect(createManyCall.data).toHaveLength(5);
    expect(createManyCall.data.map((c: { name: string }) => c.name)).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'review',
      'done',
    ]);
    expect(result).toMatchObject({ id: PROJECT_ID, role: 'OWNER' });
  });

  it('throws 409 when project key already exists (Prisma P2002)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    (mockPrisma.project.create as jest.Mock).mockRejectedValue(p2002);

    await expect(
      createProject({ name: 'Trakk', key: 'TRAKK', description: null }, USER_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('persists dueDate when provided', async () => {
    (mockPrisma.project.create as jest.Mock).mockResolvedValue({
      ...MOCK_PROJECT,
      dueDate: new Date('2026-12-31T00:00:00Z'),
    });
    (mockPrisma.projectMember.create as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.statusColumn.createMany as jest.Mock).mockResolvedValue({ count: 5 });

    const dueDate = new Date('2026-12-31T00:00:00Z');
    await createProject(
      { name: 'Trakk', key: 'TRAKK', description: null, dueDate },
      USER_ID,
    );

    expect(mockPrisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dueDate }) }),
    );
  });

  it("defaults dueDate to null when omitted", async () => {
    (mockPrisma.project.create as jest.Mock).mockResolvedValue(MOCK_PROJECT);
    (mockPrisma.projectMember.create as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.statusColumn.createMany as jest.Mock).mockResolvedValue({ count: 5 });

    await createProject(
      { name: 'Trakk', key: 'TRAKK', description: null },
      USER_ID,
    );

    expect(mockPrisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dueDate: null }) }),
    );
  });
});

// ─── updateProject ─────────────────────────────────────────────────────────

describe('updateProject', () => {
  it('updates project fields and returns updated project for OWNER', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    const updated = { ...MOCK_PROJECT, name: 'Trakk Updated' };
    (mockPrisma.project.update as jest.Mock).mockResolvedValue(updated);

    const result = await updateProject(PROJECT_ID, USER_ID, { name: 'Trakk Updated' });

    expect(mockPrisma.project.update).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ name: 'Trakk Updated' });
  });

  it('throws 403 when user is not OWNER', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MOCK_MEMBER,
      role: 'MEMBER',
    });

    await expect(
      updateProject(PROJECT_ID, USER_ID, { name: 'New Name' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 409 when the new key already exists (P2002)', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    (mockPrisma.project.update as jest.Mock).mockRejectedValue(p2002);

    await expect(
      updateProject(PROJECT_ID, USER_ID, { key: 'TAKEN' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('updates dueDate when provided', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    const dueDate = new Date('2026-12-31T00:00:00Z');
    (mockPrisma.project.update as jest.Mock).mockResolvedValue({
      ...MOCK_PROJECT,
      dueDate,
    });

    await updateProject(PROJECT_ID, USER_ID, { dueDate });

    expect(mockPrisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROJECT_ID },
        data: expect.objectContaining({ dueDate }),
      }),
    );
  });

  it('clears dueDate when explicitly set to null', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.update as jest.Mock).mockResolvedValue({
      ...MOCK_PROJECT,
      dueDate: null,
    });

    await updateProject(PROJECT_ID, USER_ID, { dueDate: null });

    expect(mockPrisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PROJECT_ID },
        data: expect.objectContaining({ dueDate: null }),
      }),
    );
  });

  it('leaves dueDate untouched when the key is absent', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.update as jest.Mock).mockResolvedValue({
      ...MOCK_PROJECT,
      name: 'Renamed Only',
    });

    await updateProject(PROJECT_ID, USER_ID, { name: 'Renamed Only' });

    const updateCall = (mockPrisma.project.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('dueDate');
  });
});

// ─── deleteProject ─────────────────────────────────────────────────────────

describe('deleteProject', () => {
  it('deletes project for OWNER', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.delete as jest.Mock).mockResolvedValue(MOCK_PROJECT);

    await deleteProject(PROJECT_ID, USER_ID);

    expect(mockPrisma.project.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROJECT_ID } }),
    );
  });

  it('throws 403 when user is MEMBER', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MOCK_MEMBER,
      role: 'MEMBER',
    });

    await expect(deleteProject(PROJECT_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

// ─── toggleArchiveProject ──────────────────────────────────────────────────

describe('toggleArchiveProject', () => {
  it('sets archivedAt to a Date when archive=true', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    const archived = { ...MOCK_PROJECT, archivedAt: new Date() };
    (mockPrisma.project.update as jest.Mock).mockResolvedValue(archived);

    const result = await toggleArchiveProject(PROJECT_ID, USER_ID, true);

    expect(mockPrisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ archivedAt: expect.any(Date) }),
      }),
    );
    expect(result.archivedAt).not.toBeNull();
  });

  it('sets archivedAt to null when archive=false', async () => {
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    const unarchived = { ...MOCK_PROJECT, archivedAt: null };
    (mockPrisma.project.update as jest.Mock).mockResolvedValue(unarchived);

    const result = await toggleArchiveProject(PROJECT_ID, USER_ID, false);

    expect(mockPrisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ archivedAt: null }),
      }),
    );
    expect(result.archivedAt).toBeNull();
  });
});
