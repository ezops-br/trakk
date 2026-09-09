// Unit tests for ticket-attachment.service.
// The service writes image bytes directly into Postgres (no storage adapter)
// and exposes a getAttachmentForDownload helper for the new GET .../raw route.

const mockBroadcast = jest.fn();

jest.mock('../lib/prisma', () => {
  const db = {
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
    ticketAttachment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  return { prisma: db };
});

jest.mock('../lib/event-broadcaster', () => ({
  broadcast: mockBroadcast,
}));

import { prisma } from '../lib/prisma';
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  getAttachmentForDownload,
} from './ticket-attachment.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const USER_ID = '550e8400-e29b-4d41-a716-446655440001';
const OWNER_ID = '550e8400-e29b-4d41-a716-446655440002';
const PROJECT_ID = '550e8400-e29b-4d41-a716-446655440010';
const TICKET_ID = '550e8400-e29b-4d41-a716-446655440020';
const TICKET_NUMBER = 7;
const ATTACHMENT_ID = '550e8400-e29b-4d41-a716-446655440030';

const FAKE_BYTES = Buffer.from('fake-image-bytes');

const MOCK_MEMBER = {
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'MEMBER' as const,
  joinedAt: new Date('2024-01-01'),
};

const MOCK_VIEWER = {
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'VIEWER' as const,
  joinedAt: new Date('2024-01-01'),
};

const MOCK_OWNER = {
  id: 'member-uuid-1',
  userId: OWNER_ID,
  projectId: PROJECT_ID,
  role: 'OWNER' as const,
  joinedAt: new Date('2024-01-01'),
};

const MOCK_TICKET = {
  id: TICKET_ID,
  projectId: PROJECT_ID,
  number: TICKET_NUMBER,
  title: 'Test Ticket',
};

// Row as returned by prisma — note: bytes (Buffer), no storageKey, no absolute url.
const MOCK_ATTACHMENT_ROW = {
  id: ATTACHMENT_ID,
  ticketId: TICKET_ID,
  uploaderId: USER_ID,
  mimeType: 'image/jpeg',
  originalName: 'screenshot.jpg',
  sizeBytes: 1024,
  bytes: FAKE_BYTES,
  createdAt: new Date('2024-01-01'),
  uploader: {
    id: USER_ID,
    displayName: 'Test User',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── listAttachments ──────────────────────────────────────────────────────────

describe('listAttachments', () => {
  it('returns the mapped attachments array', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.ticketAttachment.findMany as jest.Mock).mockResolvedValue([MOCK_ATTACHMENT_ROW]);

    const result = await listAttachments(USER_ID, PROJECT_ID, TICKET_NUMBER);

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]).toMatchObject({
      id: ATTACHMENT_ID,
      ticketId: TICKET_ID,
      uploaderId: USER_ID,
      uploaderDisplayName: 'Test User',
      mimeType: 'image/jpeg',
      originalName: 'screenshot.jpg',
      sizeBytes: 1024,
    });
    // The url field is the relative "/api/v1/projects/.../raw" path; the exact
    // shape is covered in ticket.service.spec.ts — here we just assert the
    // presence/format.
    expect(result.attachments[0].url).toMatch(
      /^\/api\/v1\/projects\/[^/]+\/tickets\/\d+\/attachments\/[^/]+\/raw$/,
    );
  });

  it('VIEWER can list (read-only allowed)', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_VIEWER);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.ticketAttachment.findMany as jest.Mock).mockResolvedValue([]);

    const result = await listAttachments(USER_ID, PROJECT_ID, TICKET_NUMBER);

    expect(result).toEqual({ attachments: [] });
  });

  it('non-member throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      listAttachments('non-member-id', PROJECT_ID, TICKET_NUMBER),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketAttachment.findMany).not.toHaveBeenCalled();
  });
});

// ─── uploadAttachment ─────────────────────────────────────────────────────────

describe('uploadAttachment', () => {
  const FILE = {
    buffer: Buffer.from('fake-image-bytes'),
    originalname: 'screenshot.png',
    mimetype: 'image/png',
    size: 4096,
  };

  it('happy path MEMBER — writes bytes directly to DB, broadcasts', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: null,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.ticketAttachment.create as jest.Mock).mockResolvedValue({
      ...MOCK_ATTACHMENT_ROW,
      mimeType: 'image/png',
      originalName: 'screenshot.png',
      sizeBytes: 4096,
      bytes: FILE.buffer,
      uploader: { id: USER_ID, displayName: 'Test User' },
    });

    const result = await uploadAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, FILE);

    // No storage adapter call — bytes go straight to the DB row.
    expect(mockPrisma.ticketAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: TICKET_ID,
          uploaderId: USER_ID,
          mimeType: 'image/png',
          originalName: 'screenshot.png',
          sizeBytes: 4096,
          bytes: FILE.buffer,
        }),
      }),
    );
    // The created row has no storageKey and no absolute url.
    const dataArg = (mockPrisma.ticketAttachment.create as jest.Mock).mock.calls[0][0].data;
    expect(dataArg).not.toHaveProperty('storageKey');
    expect(dataArg).not.toHaveProperty('url');

    expect(mockBroadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'attachment.created',
      expect.objectContaining({
        ticketNumber: TICKET_NUMBER,
        attachment: expect.objectContaining({ mimeType: 'image/png' }),
      }),
    );

    expect(result.attachment).toMatchObject({
      mimeType: 'image/png',
      originalName: 'screenshot.png',
      sizeBytes: 4096,
      uploaderDisplayName: 'Test User',
    });
    expect(result.attachment.url).toMatch(
      /^\/api\/v1\/projects\/[^/]+\/tickets\/\d+\/attachments\/[^/]+\/raw$/,
    );
  });

  it('originalName is preserved exactly (no normalization) — caller controls the filename', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: null,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.ticketAttachment.create as jest.Mock).mockResolvedValue({
      ...MOCK_ATTACHMENT_ROW,
      originalName: 'screen-shot.png',
    });

    await uploadAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, {
      ...FILE,
      originalname: 'screen-shot.png',
    });

    expect(mockPrisma.ticketAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          originalName: 'screen-shot.png',
          bytes: FILE.buffer,
          mimeType: 'image/png',
        }),
      }),
    );
  });

  it('VIEWER throws 403 before any DB write', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_VIEWER);

    await expect(
      uploadAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, FILE),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketAttachment.create).not.toHaveBeenCalled();
  });

  it('non-member throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      uploadAttachment('non-member', PROJECT_ID, TICKET_NUMBER, FILE),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketAttachment.create).not.toHaveBeenCalled();
  });

  it('oversized file throws 400', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: null,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);

    await expect(
      uploadAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        ...FILE,
        size: 9 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.ticketAttachment.create).not.toHaveBeenCalled();
  });

  it('non-image mimetype throws 400', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: null,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);

    await expect(
      uploadAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        ...FILE,
        mimetype: 'application/pdf',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.ticketAttachment.create).not.toHaveBeenCalled();
  });

  it('archived project throws 400', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: new Date('2024-06-01'),
    });

    await expect(
      uploadAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, FILE),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockPrisma.ticketAttachment.create).not.toHaveBeenCalled();
  });
});

// ─── deleteAttachment ─────────────────────────────────────────────────────────

describe('deleteAttachment', () => {
  it('happy path uploader — deletes DB row, broadcasts', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: null,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(MOCK_ATTACHMENT_ROW);
    (mockPrisma.ticketAttachment.delete as jest.Mock).mockResolvedValue(MOCK_ATTACHMENT_ROW);

    const result = await deleteAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID);

    expect(result).toEqual({ message: 'Attachment removed' });
    expect(mockPrisma.ticketAttachment.delete).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
    });
    expect(mockBroadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'attachment.deleted',
      expect.objectContaining({
        attachmentId: ATTACHMENT_ID,
        ticketNumber: TICKET_NUMBER,
      }),
    );
  });

  it('OWNER can delete another user’s attachment', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_OWNER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: null,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    // Attachment was uploaded by USER_ID, but OWNER_ID is the caller.
    (mockPrisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(MOCK_ATTACHMENT_ROW);
    (mockPrisma.ticketAttachment.delete as jest.Mock).mockResolvedValue(MOCK_ATTACHMENT_ROW);

    const result = await deleteAttachment(OWNER_ID, PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID);

    expect(result).toEqual({ message: 'Attachment removed' });
  });

  it('non-uploader MEMBER throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: null,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    // Attachment was uploaded by someone else.
    const otherUploadersAttachment = { ...MOCK_ATTACHMENT_ROW, uploaderId: 'other-user' };
    (mockPrisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(
      otherUploadersAttachment,
    );

    await expect(
      deleteAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketAttachment.delete).not.toHaveBeenCalled();
  });

  it('attachmentId not on this ticket throws 404', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: null,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    const strayAttachment = { ...MOCK_ATTACHMENT_ROW, ticketId: 'some-other-ticket' };
    (mockPrisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(strayAttachment);

    await expect(
      deleteAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.ticketAttachment.delete).not.toHaveBeenCalled();
  });

  it('attachment not found throws 404', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: PROJECT_ID,
      key: 'TEST',
      archivedAt: null,
    });
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      deleteAttachment(USER_ID, PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('non-member throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      deleteAttachment('non-member', PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketAttachment.findUnique).not.toHaveBeenCalled();
  });
});

// ─── getAttachmentForDownload ─────────────────────────────────────────────────

describe('getAttachmentForDownload', () => {
  it('returns bytes + mimeType + sizeBytes for a matching attachment', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(MOCK_ATTACHMENT_ROW);

    const result = await getAttachmentForDownload(
      USER_ID,
      PROJECT_ID,
      TICKET_NUMBER,
      ATTACHMENT_ID,
    );

    expect(result.bytes).toBe(FAKE_BYTES);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.sizeBytes).toBe(1024);
  });

  it('non-member throws 403', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      getAttachmentForDownload(USER_ID, PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.ticketAttachment.findUnique).not.toHaveBeenCalled();
  });

  it('attachment not on this ticket throws 404', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    const strayAttachment = { ...MOCK_ATTACHMENT_ROW, ticketId: 'some-other-ticket' };
    (mockPrisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(strayAttachment);

    await expect(
      getAttachmentForDownload(USER_ID, PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('attachment not found throws 404', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    (mockPrisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      getAttachmentForDownload(USER_ID, PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // Legacy pre-bytea S3 era (PR #39) rows have bytes = NULL. By design, those
  // rows are unrecoverable — the raw route returns 404 (matches the "don't leak
  // existence" convention used for cross-ticket attachment IDs). The service
  // surfaces that contract as a 404 AppError rather than a Buffer.alloc(0)
  // placeholder, so no Content-Length is ever set on the 404 path.
  it('row exists but bytes is null throws 404 AppError (legacy PR #39 row)', async () => {
    (mockPrisma.projectMember.findUnique as jest.Mock).mockResolvedValue(MOCK_MEMBER);
    (mockPrisma.ticket.findFirst as jest.Mock).mockResolvedValue(MOCK_TICKET);
    const legacyRow = { ...MOCK_ATTACHMENT_ROW, bytes: null };
    (mockPrisma.ticketAttachment.findUnique as jest.Mock).mockResolvedValue(legacyRow);

    await expect(
      getAttachmentForDownload(USER_ID, PROJECT_ID, TICKET_NUMBER, ATTACHMENT_ID),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: 'Attachment bytes are not available',
    });
  });
});
