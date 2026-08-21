// @ts-nocheck
// Mock prisma and event-broadcaster before importing the service.
// $transaction is wired to pass the same mock object as tx so that
// assertions on mockPrisma.comment.create etc. work regardless of
// whether the call is made on the top-level prisma or inside a transaction.

const mockBroadcast = jest.fn();

jest.mock('../lib/prisma', () => {
  const db = {
    $transaction: jest.fn(),
    projectMember: {
      findFirst: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
    },
    ticket: {
      findFirst: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
import {
  listComments,
  createComment,
  updateComment,
  deleteComment,
} from './comment.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = '550e8400-e29b-4d41-a716-446655440001';
const OTHER_USER_ID = '550e8400-e29b-4d41-a716-446655440002';
const PROJECT_ID = '550e8400-e29b-4d41-a716-446655440010';
const TICKET_ID = '550e8400-e29b-4d41-a716-446655440020';
const COMMENT_ID = '550e8400-e29b-4d41-a716-446655440030';
const TICKET_NUMBER = 42;

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
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'OWNER' as const,
  joinedAt: new Date('2024-01-01'),
};

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

const MOCK_OTHER_MEMBER_MEMBERSHIP = {
  id: 'member-uuid-2',
  userId: OTHER_USER_ID,
  projectId: PROJECT_ID,
  role: 'MEMBER' as const,
  joinedAt: new Date('2024-01-01'),
};

const MOCK_ACTIVE_PROJECT = {
  id: PROJECT_ID,
  name: 'Test Project',
  key: 'TEST',
  archivedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const MOCK_ARCHIVED_PROJECT = {
  ...MOCK_ACTIVE_PROJECT,
  archivedAt: new Date('2024-06-01'),
};

const MOCK_TICKET = {
  id: TICKET_ID,
  projectId: PROJECT_ID,
  number: TICKET_NUMBER,
  title: 'Test Ticket',
};

const MOCK_COMMENT = {
  id: COMMENT_ID,
  ticketId: TICKET_ID,
  authorId: USER_ID,
  body: 'This is a test comment.',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  author: MOCK_USER,
};

const MOCK_OTHER_COMMENT = {
  id: COMMENT_ID,
  ticketId: TICKET_ID,
  authorId: OTHER_USER_ID,
  body: 'Bob wrote this comment.',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  author: MOCK_OTHER_USER,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Restore $transaction pass-through after clearAllMocks resets it.
  (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(mockPrisma));
});

// ─── listComments ─────────────────────────────────────────────────────────────

describe('listComments', () => {
  it('happy path — member retrieves comments ordered createdAt ASC', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.findMany as jest.Mock).mockResolvedValue([MOCK_COMMENT]);

    // Act
    const result = await listComments(USER_ID, PROJECT_ID, TICKET_NUMBER);

    // Assert
    expect(result).toMatchObject({ comments: [expect.objectContaining({ id: COMMENT_ID })] });
    expect(mockPrisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  it('Viewer role can list comments (read-only allowed)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_VIEWER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.findMany as jest.Mock).mockResolvedValue([]);

    // Act
    const result = await listComments(USER_ID, PROJECT_ID, TICKET_NUMBER);

    // Assert — Viewer can list, no error
    expect(result).toMatchObject({ comments: [] });
  });

  it('non-member throws 403', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(listComments('non-member-id', PROJECT_ID, TICKET_NUMBER)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mockPrisma.comment.findMany).not.toHaveBeenCalled();
  });

  it('ticket not found throws 404', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(listComments(USER_ID, PROJECT_ID, TICKET_NUMBER)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(mockPrisma.comment.findMany).not.toHaveBeenCalled();
  });
});

// ─── createComment ────────────────────────────────────────────────────────────

describe('createComment', () => {
  it('happy path MEMBER — comment created, activity log called with commented, broadcast called with comment.created', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.create as jest.Mock).mockResolvedValue(MOCK_COMMENT);
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    const result = await createComment(USER_ID, PROJECT_ID, TICKET_NUMBER, 'This is a test comment.');

    // Assert
    expect(result).toMatchObject({ comment: expect.objectContaining({ id: COMMENT_ID }) });
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'commented' }),
      }),
    );
    expect(mockBroadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'comment.created',
      expect.objectContaining({ comment: expect.anything() }),
    );
  });

  it('activity log newValue is body verbatim when body <= 100 chars', async () => {
    // Arrange
    const shortBody = 'Short comment body.';
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.create as jest.Mock).mockResolvedValue({ ...MOCK_COMMENT, body: shortBody });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    await createComment(USER_ID, PROJECT_ID, TICKET_NUMBER, shortBody);

    // Assert
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ newValue: shortBody }),
      }),
    );
  });

  it('activity log newValue is truncated to 100 chars + ... when body > 100 chars', async () => {
    // Arrange
    const longBody = 'A'.repeat(101);
    const expectedTruncated = 'A'.repeat(100) + '...';
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.create as jest.Mock).mockResolvedValue({ ...MOCK_COMMENT, body: longBody });
    (mockPrisma.activityLog.create as jest.Mock).mockResolvedValue({});

    // Act
    await createComment(USER_ID, PROJECT_ID, TICKET_NUMBER, longBody);

    // Assert
    expect(mockPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ newValue: expectedTruncated }),
      }),
    );
  });

  it('VIEWER throws 403 before any DB write', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_VIEWER_MEMBERSHIP);

    // Act & Assert
    await expect(
      createComment(USER_ID, PROJECT_ID, TICKET_NUMBER, 'Viewer trying to comment'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.create).not.toHaveBeenCalled();
  });

  it('archived project throws 403', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ARCHIVED_PROJECT);

    // Act & Assert
    await expect(
      createComment(USER_ID, PROJECT_ID, TICKET_NUMBER, 'Comment on archived project'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.create).not.toHaveBeenCalled();
  });
});

// ─── updateComment ────────────────────────────────────────────────────────────

describe('updateComment', () => {
  it('happy path author — body updated, broadcast called with comment.updated', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.findUnique as jest.Mock).mockResolvedValue(MOCK_COMMENT);
    const updatedComment = { ...MOCK_COMMENT, body: 'Updated body.' };
    (mockPrisma.comment.update as jest.Mock).mockResolvedValue(updatedComment);

    // Act
    const result = await updateComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID, 'Updated body.');

    // Assert
    expect(result).toMatchObject({ comment: expect.objectContaining({ body: 'Updated body.' }) });
    expect(mockBroadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'comment.updated',
      expect.objectContaining({ comment: expect.anything() }),
    );
  });

  it('VIEWER throws 403', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_VIEWER_MEMBERSHIP);

    // Act & Assert
    await expect(
      updateComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID, 'Viewer trying to edit'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.update).not.toHaveBeenCalled();
  });

  it('non-author MEMBER throws 403', async () => {
    // Arrange — USER_ID is MEMBER, but the comment belongs to OTHER_USER_ID
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.findUnique as jest.Mock).mockResolvedValue(MOCK_OTHER_COMMENT);

    // Act & Assert
    await expect(
      updateComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID, 'Trying to edit another comment'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.update).not.toHaveBeenCalled();
  });

  it('OWNER editing another user comment throws 403 (edit is author-only, no OWNER exception)', async () => {
    // Arrange — USER_ID is OWNER, but the comment belongs to OTHER_USER_ID
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_OWNER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.findUnique as jest.Mock).mockResolvedValue(MOCK_OTHER_COMMENT);

    // Act & Assert
    await expect(
      updateComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID, 'Owner trying to edit other comment'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.update).not.toHaveBeenCalled();
  });

  it('comment not on this ticket throws 404', async () => {
    // Arrange — comment exists but belongs to a different ticket
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.findUnique as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(
      updateComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID, 'Edit on non-existent comment'),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.comment.update).not.toHaveBeenCalled();
  });

  it('archived project throws 403', async () => {
    // Arrange: member role returns fine, but project.findUnique returns archived project
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ARCHIVED_PROJECT);

    // Act & Assert
    await expect(
      updateComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID, 'Edit on archived project'),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.update).not.toHaveBeenCalled();
  });
});

// ─── deleteComment ────────────────────────────────────────────────────────────

describe('deleteComment', () => {
  it('happy path author — comment deleted, broadcast called with comment.deleted', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.findUnique as jest.Mock).mockResolvedValue(MOCK_COMMENT);
    (mockPrisma.comment.delete as jest.Mock).mockResolvedValue(MOCK_COMMENT);

    // Act
    await deleteComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID);

    // Assert
    expect(mockPrisma.comment.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COMMENT_ID } }),
    );
    expect(mockBroadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'comment.deleted',
      expect.objectContaining({ commentId: COMMENT_ID, ticketId: TICKET_ID }),
    );
  });

  it('OWNER deletes another users comment — succeeds (moderation)', async () => {
    // Arrange — USER_ID is OWNER, but MOCK_OTHER_COMMENT was authored by OTHER_USER_ID
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_OWNER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.findUnique as jest.Mock).mockResolvedValue(MOCK_OTHER_COMMENT);
    (mockPrisma.comment.delete as jest.Mock).mockResolvedValue(MOCK_OTHER_COMMENT);

    // Act — should not throw
    await expect(
      deleteComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID),
    ).resolves.toBeUndefined();
    expect(mockPrisma.comment.delete).toHaveBeenCalled();
  });

  it('VIEWER throws 403 (explicit check before archive check)', async () => {
    // Arrange
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_VIEWER_MEMBERSHIP);

    // Act & Assert
    await expect(
      deleteComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.delete).not.toHaveBeenCalled();
  });

  it('non-author MEMBER throws 403', async () => {
    // Arrange — USER_ID is MEMBER, but the comment belongs to OTHER_USER_ID
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.comment.findUnique as jest.Mock).mockResolvedValue(MOCK_OTHER_COMMENT);

    // Act & Assert
    await expect(
      deleteComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.delete).not.toHaveBeenCalled();
  });

  it('archived project throws 403', async () => {
    // Arrange: member role returns fine, but project.findUnique returns archived project
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ARCHIVED_PROJECT);

    // Act & Assert
    await expect(
      deleteComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.delete).not.toHaveBeenCalled();
  });

  it('ticket not found throws 404', async () => {
    // Arrange: member role returns OWNER, project not archived, but ticket.findFirst returns null
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_OWNER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(
      deleteComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.comment.delete).not.toHaveBeenCalled();
  });
});

// ─── archived ticket guard ────────────────────────────────────────────────────

describe('archived ticket guard', () => {
  const MOCK_ARCHIVED_TICKET = {
    ...MOCK_TICKET,
    archivedAt: new Date('2026-08-01T10:00:00.000Z'),
  };

  it('blocks comment mutations on an archived ticket with 403', async () => {
    // Arrange — active project, member role, but the ticket itself is archived.
    (mockPrisma.projectMember.findFirst as jest.Mock).mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(MOCK_ACTIVE_PROJECT);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_ARCHIVED_TICKET);
    (mockPrisma.comment.findUnique as jest.Mock).mockResolvedValue(MOCK_COMMENT);

    // Act & Assert — comment.service.ts uses forbidden() (403) for archive guards,
    // deliberately different from ticket.service.ts's badRequest() (400).
    await expect(
      createComment(USER_ID, PROJECT_ID, TICKET_NUMBER, 'new comment'),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      updateComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID, 'edited'),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      deleteComment(USER_ID, PROJECT_ID, TICKET_NUMBER, COMMENT_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.comment.create).not.toHaveBeenCalled();
    expect(mockPrisma.comment.update).not.toHaveBeenCalled();
    expect(mockPrisma.comment.delete).not.toHaveBeenCalled();
  });
});
