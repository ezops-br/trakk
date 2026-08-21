// @ts-nocheck
// Mock prisma before importing the service.
// $transaction is wired to pass the same mock object as tx so that
// assertions on mockPrisma.projectMember.create etc. work regardless of
// whether the call is made on the top-level prisma or inside a transaction.
jest.mock('../lib/prisma', () => {
  const db = {
    $transaction: jest.fn(),
    projectMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
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
  listMembers,
  inviteMember,
  changeMemberRole,
  removeMember,
} from './member.service';
import { AppError } from '../lib/app-error';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = 'user-uuid-1';
const OTHER_USER_ID = 'user-uuid-2';
const PROJECT_ID = 'proj-uuid-1';
const MEMBER_ID = 'member-uuid-1';
const OTHER_MEMBER_ID = 'member-uuid-2';

const MOCK_USER = {
  id: USER_ID,
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  avatarUrl: null,
  themePreference: 'light',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const MOCK_OTHER_USER = {
  id: OTHER_USER_ID,
  email: 'bob@example.com',
  displayName: 'Bob Jones',
  avatarUrl: null,
  themePreference: 'light',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const MOCK_OWNER_MEMBERSHIP = {
  id: MEMBER_ID,
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'OWNER' as const,
  joinedAt: new Date('2024-01-01'),
  user: MOCK_USER,
};

const MOCK_OTHER_MEMBER_MEMBERSHIP = {
  id: OTHER_MEMBER_ID,
  userId: OTHER_USER_ID,
  projectId: PROJECT_ID,
  role: 'MEMBER' as const,
  joinedAt: new Date('2024-01-01'),
  user: MOCK_OTHER_USER,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Restore $transaction pass-through after clearAllMocks resets it.
  (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(mockPrisma));
});

// ─── listMembers ──────────────────────────────────────────────────────────────

describe('listMembers', () => {
  it('returns members with nested user data for a project member', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_OWNER_MEMBERSHIP);
    (mockPrisma.projectMember.findMany as jest.Mock).mockResolvedValue([
      MOCK_OWNER_MEMBERSHIP,
      MOCK_OTHER_MEMBER_MEMBERSHIP,
    ]);

    // Act
    const result = await listMembers(USER_ID, PROJECT_ID);

    // Assert
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: MEMBER_ID,
      userId: USER_ID,
      role: 'OWNER',
    });
    expect(result[0].user).toMatchObject({ email: 'alice@example.com' });
  });

  it('throws 403 when requestingUserId is not a project member', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(listMembers('non-member-id', PROJECT_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.projectMember.findMany).not.toHaveBeenCalled();
  });
});

// ─── inviteMember ─────────────────────────────────────────────────────────────

describe('inviteMember', () => {
  it('OWNER invites valid email and returns created membership', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(MOCK_OWNER_MEMBERSHIP) // role check
      .mockResolvedValueOnce(null); // existing membership check
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_OTHER_USER);
    const newMembership = {
      id: 'new-member-uuid',
      userId: OTHER_USER_ID,
      projectId: PROJECT_ID,
      role: 'MEMBER' as const,
      joinedAt: new Date(),
      user: MOCK_OTHER_USER,
    };
    (mockPrisma.projectMember.create as jest.Mock).mockResolvedValue(newMembership);

    // Act
    const result = await inviteMember(USER_ID, PROJECT_ID, 'bob@example.com', 'MEMBER');

    // Assert
    expect(mockPrisma.projectMember.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ userId: OTHER_USER_ID, role: 'MEMBER' });
  });

  it('throws 403 when requester is MEMBER (not OWNER)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MOCK_OWNER_MEMBERSHIP,
      role: 'MEMBER',
    });

    // Act & Assert
    await expect(
      inviteMember(USER_ID, PROJECT_ID, 'bob@example.com', 'MEMBER'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws 404 with correct message when email not found in system', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_OWNER_MEMBERSHIP);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(
      inviteMember(USER_ID, PROJECT_ID, 'unknown@example.com', 'MEMBER'),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'No Trakk account found for this email. They must sign in with Google first.',
    });
  });

  it('throws 409 with correct message when user is already a member', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(MOCK_OWNER_MEMBERSHIP) // role check
      .mockResolvedValueOnce(MOCK_OTHER_MEMBER_MEMBERSHIP); // existing membership check
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(MOCK_OTHER_USER);

    // Act & Assert
    await expect(
      inviteMember(USER_ID, PROJECT_ID, 'bob@example.com', 'MEMBER'),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'User is already a member of this project',
    });
    expect(mockPrisma.projectMember.create).not.toHaveBeenCalled();
  });
});

// ─── changeMemberRole ─────────────────────────────────────────────────────────

describe('changeMemberRole', () => {
  it('OWNER successfully changes another member role', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(MOCK_OWNER_MEMBERSHIP) // role check
      .mockResolvedValueOnce(MOCK_OTHER_MEMBER_MEMBERSHIP); // target member lookup
    const updated = { ...MOCK_OTHER_MEMBER_MEMBERSHIP, role: 'OWNER' as const };
    // changeMemberRole returns the updated membership from update
    mockPrisma.projectMember.delete = jest.fn(); // shouldn't be called
    const mockUpdate = jest.fn().mockResolvedValue(updated);
    mockPrisma.projectMember['update'] = mockUpdate;

    // Act
    const result = await changeMemberRole(USER_ID, PROJECT_ID, OTHER_MEMBER_ID, 'OWNER');

    // Assert
    expect(result).toMatchObject({ role: 'OWNER' });
  });

  it('throws 403 when requester is not OWNER', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue({
      ...MOCK_OWNER_MEMBERSHIP,
      role: 'MEMBER',
    });

    // Act & Assert
    await expect(
      changeMemberRole(USER_ID, PROJECT_ID, OTHER_MEMBER_ID, 'OWNER'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 with correct message when OWNER attempts to change own role', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_OWNER_MEMBERSHIP);

    // Act & Assert
    await expect(
      changeMemberRole(USER_ID, PROJECT_ID, MEMBER_ID, 'MEMBER'),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'You cannot change your own role. Ask another Owner to do this.',
    });
  });

  it('throws 400 with correct message when demoting the last OWNER', async () => {
    // Arrange
    // target is also an OWNER; requester is a different OWNER demoting the last peer
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(MOCK_OWNER_MEMBERSHIP) // role check (requester is OWNER)
      .mockResolvedValueOnce({ ...MOCK_OTHER_MEMBER_MEMBERSHIP, role: 'OWNER' }); // target is OWNER
    // count of OTHER owners (excluding target) is 0 — no one left to hold the role
    (mockPrisma.projectMember.count as jest.Mock).mockResolvedValue(0);

    // Act & Assert
    await expect(
      changeMemberRole(USER_ID, PROJECT_ID, OTHER_MEMBER_ID, 'MEMBER'),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot change role — you are the only owner. Promote another member to Owner first.',
    });
  });
});

// ─── removeMember ─────────────────────────────────────────────────────────────

describe('removeMember', () => {
  it('OWNER removes a MEMBER and unassigns their tickets in $transaction', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(MOCK_OWNER_MEMBERSHIP) // role check
      .mockResolvedValueOnce(MOCK_OTHER_MEMBER_MEMBERSHIP); // target member lookup
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.projectMember.delete as jest.Mock).mockResolvedValue(MOCK_OTHER_MEMBER_MEMBERSHIP);

    // Act
    await removeMember(USER_ID, PROJECT_ID, OTHER_MEMBER_ID);

    // Assert — both ticket unassign and member delete must happen
    expect(mockPrisma.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assigneeId: OTHER_USER_ID }),
        data: { assigneeId: null },
      }),
    );
    expect(mockPrisma.projectMember.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OTHER_MEMBER_ID } }),
    );
  });

  it('throws 403 when MEMBER tries to remove another member (not self)', async () => {
    // Arrange
    const requesterMembership = { ...MOCK_OWNER_MEMBERSHIP, role: 'MEMBER' as const };
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(requesterMembership) // role check: requester is MEMBER
      .mockResolvedValueOnce(MOCK_OTHER_MEMBER_MEMBERSHIP); // target is a different user

    // Act & Assert
    await expect(
      removeMember(USER_ID, PROJECT_ID, OTHER_MEMBER_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 with correct message when OWNER tries to remove self as last owner', async () => {
    // Arrange — requester is OWNER, target is self, and is the only owner
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(MOCK_OWNER_MEMBERSHIP) // role check (returns self)
      .mockResolvedValueOnce(MOCK_OWNER_MEMBERSHIP); // target lookup returns same record (self)
    // count of OTHER owners (excluding self) is 0 — no one else can hold the role
    (mockPrisma.projectMember.count as jest.Mock).mockResolvedValue(0);

    // Act & Assert
    await expect(
      removeMember(USER_ID, PROJECT_ID, MEMBER_ID),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Cannot remove the last owner. Promote another member to Owner first.',
    });
    expect(mockPrisma.projectMember.delete).not.toHaveBeenCalled();
  });

  it('MEMBER successfully removes self (self-leave)', async () => {
    // Arrange — requester is MEMBER, target is self
    const selfMembership = { ...MOCK_OWNER_MEMBERSHIP, role: 'MEMBER' as const };
    (mockPrisma.projectMember.findFirst as jest.Mock)
      .mockResolvedValueOnce(selfMembership) // role check (self)
      .mockResolvedValueOnce(selfMembership); // target lookup
    (mockPrisma.ticket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.projectMember.delete as jest.Mock).mockResolvedValue(selfMembership);

    // Act — should not throw
    await expect(
      removeMember(USER_ID, PROJECT_ID, MEMBER_ID),
    ).resolves.toBeUndefined();

    // Assert
    expect(mockPrisma.projectMember.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MEMBER_ID } }),
    );
  });
});
