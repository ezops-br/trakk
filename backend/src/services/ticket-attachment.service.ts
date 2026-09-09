import { Role } from '@prisma/client';
import { Request } from 'express';
import { prisma } from '../lib/prisma';
import { badRequest, forbidden, notFound } from '../lib/app-error';
import { broadcast } from '../lib/event-broadcaster';

const ALLOWED_MIMETYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export interface TicketAttachmentFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface TicketAttachmentDto {
  id: string;
  ticketId: string;
  uploaderId: string;
  uploaderDisplayName: string;
  url: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  createdAt: Date;
}

// Resolves the authenticated user's role on a project. Returns null if the
// user is not a member. Callers decide whether membership is sufficient
// (e.g. listAttachments) or whether non-OWNER/non-MEMBER roles are blocked
// (upload, delete).
async function getUserProjectRole(
  projectId: string,
  userId: string,
): Promise<Role | null> {
  const member = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

// Throws 400 if the project is archived (mutations are blocked on archived
// projects). Mirrors ticket-link.service.ts.
async function assertProjectNotArchived(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, archivedAt: true },
  });
  if (!project) {
    throw notFound('Project not found');
  }
  if (project.archivedAt !== null) {
    throw badRequest('Cannot modify an archived project');
  }
}

// Finds a ticket by project + ticketNumber. Throws 404 if not found.
async function resolveTicket(projectId: string, ticketNumber: number) {
  const ticket = await prisma.ticket.findFirst({
    where: { projectId, number: ticketNumber },
  });
  if (!ticket) {
    throw notFound('Ticket not found');
  }
  return ticket;
}

function mimeToExt(mimeType: string): string {
  const ext = ALLOWED_MIMETYPES[mimeType];
  if (!ext) {
    throw badRequest('Unsupported image type');
  }
  return ext;
}

// Composes the lazy-fetch URL exposed to the client. Bytes are served by
// GET .../raw on the ticket-attachment router; the URL must be relative so
// the browser resolves it against the API base.
export function buildAttachmentRawUrl(
  projectId: string,
  ticketNumber: number,
  attachmentId: string,
): string {
  return `/api/v1/projects/${projectId}/tickets/${ticketNumber}/attachments/${attachmentId}/raw`;
}

export async function listAttachments(
  userId: string,
  projectId: string,
  ticketNumber: number,
): Promise<{ attachments: TicketAttachmentDto[] }> {
  // Any project member (including VIEWER) may read attachments.
  const role = await getUserProjectRole(projectId, userId);
  if (role === null) {
    throw forbidden();
  }
  const ticket = await resolveTicket(projectId, ticketNumber);

  const rows = await prisma.ticketAttachment.findMany({
    where: { ticketId: ticket.id },
    select: {
      id: true,
      ticketId: true,
      uploaderId: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      uploader: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const attachments: TicketAttachmentDto[] = rows.map((row) => ({
    id: row.id,
    ticketId: row.ticketId,
    uploaderId: row.uploaderId,
    uploaderDisplayName: row.uploader.displayName,
    url: buildAttachmentRawUrl(projectId, ticketNumber, row.id),
    mimeType: row.mimeType,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
  }));

  return { attachments };
}

export async function uploadAttachment(
  userId: string,
  projectId: string,
  ticketNumber: number,
  file: TicketAttachmentFile,
): Promise<{ attachment: TicketAttachmentDto }> {
  // Role check — VIEWERs cannot upload attachments.
  const role = await getUserProjectRole(projectId, userId);
  if (role === null) {
    throw forbidden();
  }
  if (role === Role.VIEWER) {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);

  if (!file || !file.buffer || file.size === 0) {
    throw badRequest('Image file is required');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw badRequest('Image must be 8 MB or smaller');
  }
  // Validate the extension map up front so unsupported mime types are
  // rejected before we touch the DB. Mime-to-extension is still needed for
  // future download URLs and consistency with the existing schema.
  mimeToExt(file.mimetype);

  const created = await prisma.ticketAttachment.create({
    data: {
      ticketId: ticket.id,
      uploaderId: userId,
      bytes: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
      sizeBytes: file.size,
    },
    include: {
      uploader: { select: { id: true, displayName: true } },
    },
  });

  const attachment: TicketAttachmentDto = {
    id: created.id,
    ticketId: created.ticketId,
    uploaderId: created.uploaderId,
    uploaderDisplayName: created.uploader.displayName,
    url: buildAttachmentRawUrl(projectId, ticketNumber, created.id),
    mimeType: created.mimeType,
    originalName: created.originalName,
    sizeBytes: created.sizeBytes,
    createdAt: created.createdAt,
  };

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'attachment.created', {
    attachment,
    ticketNumber,
  });

  return { attachment };
}

export async function deleteAttachment(
  userId: string,
  projectId: string,
  ticketNumber: number,
  attachmentId: string,
): Promise<{ message: string }> {
  // Role check — any member role (OWNER/MEMBER/VIEWER) can DELETE, but the
  // per-row permission is enforced below (uploader or OWNER only).
  const role = await getUserProjectRole(projectId, userId);
  if (role === null) {
    throw forbidden();
  }
  const ticket = await resolveTicket(projectId, ticketNumber);
  await assertProjectNotArchived(projectId);

  const attachment = await prisma.ticketAttachment.findUnique({
    where: { id: attachmentId },
  });
  if (!attachment || attachment.ticketId !== ticket.id) {
    throw notFound('Attachment not found for this ticket');
  }

  // Per-row permission: uploader or project OWNER can remove.
  if (attachment.uploaderId !== userId && role !== Role.OWNER) {
    throw forbidden();
  }

  await prisma.ticketAttachment.delete({ where: { id: attachmentId } });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'attachment.deleted', {
    attachmentId,
    ticketNumber,
    ticketId: ticket.id,
  });

  return { message: 'Attachment removed' };
}

// Fetches an attachment row, asserting it belongs to the given ticket and
// that the caller is a project member at VIEWER+ role. Throws 404 (not 403)
// when the attachment is not on this ticket — same "don't leak existence"
// rule used in deleteAttachment.
export async function getAttachmentForDownload(
  userId: string,
  projectId: string,
  ticketNumber: number,
  attachmentId: string,
): Promise<{
  bytes: Buffer;
  mimeType: string;
  sizeBytes: number;
}> {
  const role = await getUserProjectRole(projectId, userId);
  if (role === null) {
    throw forbidden();
  }
  const ticket = await resolveTicket(projectId, ticketNumber);

  const attachment = await prisma.ticketAttachment.findUnique({
    where: { id: attachmentId },
  });
  if (!attachment || attachment.ticketId !== ticket.id) {
    throw notFound('Attachment not found for this ticket');
  }

  if (attachment.bytes === null || attachment.bytes === undefined) {
    // Legacy rows from the pre-bytea S3 era (PR #39) have bytes = NULL; by
    // design, those rows are unrecoverable. Return 404 (not 410 Gone, not 422)
    // to match the existing "don't leak existence" convention used for
    // cross-ticket attachment IDs.
    throw notFound('Attachment bytes are not available');
  }

  return {
    bytes: attachment.bytes,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  };
}

// Convenience helper for the Express route: extracts a single uploaded file
// from a multer middleware'd request, or throws 400 if absent. Kept here so
// the service contract owns the "what counts as a valid file" decision.
export function extractUploadedFile(req: Request): TicketAttachmentFile {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) {
    throw badRequest('Image file is required');
  }
  return {
    buffer: file.buffer,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  };
}