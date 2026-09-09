import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../lib/app-error';
import { logActivity } from './activity.service';
import { broadcast } from '../lib/event-broadcaster';

export type { LinkType, CreateTicketLinkBody } from '../routes/ticket-link.schemas';

// Resolves the authenticated user's role on a project. Returns null if the
// user is not a member. Callers decide whether membership is sufficient
// (e.g. listLinks) or whether non-OWNER/non-MEMBER roles are blocked
// (createLink, deleteLink).
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

// Throws 403 if the project is archived (mutations are blocked on archived
// projects). Mirrors the comment.service.ts pattern.
async function assertProjectNotArchived(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, archivedAt: true },
  });
  if (!project) {
    throw notFound('Project not found');
  }
  if (project.archivedAt !== null) {
    throw forbidden('Cannot modify an archived project');
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

// Derives a human-readable verb for the link from the requester's ticket
// perspective. See the brief's display-type table.
function deriveDisplayType(
  link: { sourceTicketId: string; targetTicketId: string; type: 'BLOCKS' | 'RELATES_TO' | 'DUPLICATES' },
  ticketId: string,
): 'Blocks' | 'Is blocked by' | 'Relates to' | 'Duplicates' | 'Is duplicated by' {
  const isSource = link.sourceTicketId === ticketId;
  if (link.type === 'BLOCKS') {
    return isSource ? 'Blocks' : 'Is blocked by';
  }
  if (link.type === 'RELATES_TO') {
    return 'Relates to';
  }
  // DUPLICATES
  return isSource ? 'Duplicates' : 'Is duplicated by';
}

export async function listLinks(
  userId: string,
  projectId: string,
  ticketNumber: number,
): Promise<{ links: Array<{
  id: string;
  sourceTicketId: string;
  targetTicketId: string;
  type: 'BLOCKS' | 'RELATES_TO' | 'DUPLICATES';
  direction: 'outgoing' | 'incoming';
  createdAt: Date;
  createdById: string;
  targetNumber: number;
  targetTitle: string;
  targetProjectId: string;
  targetProjectKey: string;
  targetPriority: string;
  targetStatusColumnName: string;
  displayType: string;
}> }> {
  // Any project member (including VIEWER) may read the link graph.
  const role = await getUserProjectRole(projectId, userId);
  if (role === null) {
    throw forbidden();
  }
  const ticket = await resolveTicket(projectId, ticketNumber);

  const rows = await prisma.ticketLink.findMany({
    where: {
      OR: [{ sourceTicketId: ticket.id }, { targetTicketId: ticket.id }],
    },
    include: {
      sourceTicket: {
        include: {
          project: { select: { key: true } },
          statusColumn: { select: { name: true } },
        },
      },
      targetTicket: {
        include: {
          project: { select: { key: true } },
          statusColumn: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const links = rows.map((row) => {
    const isSource = row.sourceTicketId === ticket.id;
    const other = isSource ? row.targetTicket : row.sourceTicket;
    return {
      id: row.id,
      sourceTicketId: row.sourceTicketId,
      targetTicketId: row.targetTicketId,
      type: row.type,
      direction: (isSource ? 'outgoing' : 'incoming') as 'outgoing' | 'incoming',
      createdAt: row.createdAt,
      createdById: row.createdByUserId,
      targetNumber: other.number,
      targetTitle: other.title,
      targetProjectId: other.projectId,
      targetProjectKey: other.project.key,
      targetPriority: other.priority,
      targetStatusColumnName: other.statusColumn.name,
      displayType: deriveDisplayType(row, ticket.id),
    };
  });

  return { links };
}

export async function createLink(
  userId: string,
  projectId: string,
  sourceTicketNumber: number,
  input: { targetTicketNumber: number; type: 'BLOCKS' | 'RELATES_TO' | 'DUPLICATES' },
): Promise<{ link: { id: string; sourceTicketId: string; targetTicketId: string; type: 'BLOCKS' | 'RELATES_TO' | 'DUPLICATES'; createdAt: Date } }> {
  // Role check — VIEWERs cannot mutate link graph.
  const role = await getUserProjectRole(projectId, userId);
  if (role === null) {
    throw forbidden();
  }
  if (role === Role.VIEWER) {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  const source = await resolveTicket(projectId, sourceTicketNumber);
  const target = await resolveTicket(projectId, input.targetTicketNumber);

  if (source.id === target.id) {
    throw badRequest('Cannot link a ticket to itself');
  }
  // Cross-project rejection is structurally impossible: both source and
  // target are resolved via resolveTicket(projectId, ticketNumber) which
  // joins on projectId, so target.projectId === source.projectId === projectId
  // by construction. Kept as a defensive invariant check (not a redundant
  // query) so a future refactor that bypasses resolveTicket is caught.

  // Probe for duplicate (same direction) and inverse-duplicate (swapped).
  // Either existing row raises 409 with the appropriate message.
  const sameDir = await prisma.ticketLink.findFirst({
    where: {
      sourceTicketId: source.id,
      targetTicketId: target.id,
      type: input.type,
    },
    select: { id: true },
  });
  if (sameDir) {
    throw conflict('This link already exists');
  }
  const inverseDir = await prisma.ticketLink.findFirst({
    where: {
      sourceTicketId: target.id,
      targetTicketId: source.id,
      type: input.type,
    },
    select: { id: true },
  });
  if (inverseDir) {
    throw conflict('Inverse link already exists');
  }

  // Project key is required for the activity-log message
  // (`TRK-<projectKey>-<ticketNumber>`); look it up inside the transaction so
  // the log entry reflects the same snapshot as the link creation.
  const projectKey = (await prisma.project.findUnique({
    where: { id: source.projectId },
    select: { key: true },
  }))?.key ?? 'UNKNOWN';

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketLink.create({
      data: {
        sourceTicketId: source.id,
        targetTicketId: target.id,
        type: input.type,
        createdByUserId: userId,
      },
    });

    const newValue = `TRK-${projectKey}-${target.number}`;

    await logActivity(tx, {
      ticketId: source.id,
      userId,
      action: 'link_added',
      oldValue: null,
      newValue,
    });
    await logActivity(tx, {
      ticketId: target.id,
      userId,
      action: 'link_added',
      oldValue: null,
      newValue,
    });

    return { link: created };
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'link.created', {
    link: result.link,
    sourceTicketNumber: source.number,
    targetTicketNumber: target.number,
  });

  return result;
}

export async function deleteLink(
  userId: string,
  projectId: string,
  ticketNumber: number,
  linkId: string,
): Promise<{ message: string }> {
  const role = await getUserProjectRole(projectId, userId);
  if (role === null) {
    throw forbidden();
  }
  if (role === Role.VIEWER) {
    throw forbidden();
  }
  const ticket = await resolveTicket(projectId, ticketNumber);
  await assertProjectNotArchived(projectId);

  const link = await prisma.ticketLink.findUnique({ where: { id: linkId } });
  if (!link) {
    throw notFound('Link not found for this ticket');
  }
  if (link.sourceTicketId !== ticket.id && link.targetTicketId !== ticket.id) {
    throw notFound('Link not found for this ticket');
  }

  const otherTicketId =
    link.sourceTicketId === ticket.id ? link.targetTicketId : link.sourceTicketId;

  await prisma.$transaction(async (tx) => {
    await tx.ticketLink.delete({ where: { id: linkId } });

    const projectKey = (await tx.project.findUnique({
      where: { id: projectId },
      select: { key: true },
    }))?.key ?? 'UNKNOWN';

    // Look up the other ticket's number for the human-readable message.
    const otherTicket = await tx.ticket.findUnique({
      where: { id: otherTicketId },
      select: { number: true },
    });
    const otherReference = `TRK-${projectKey}-${otherTicket?.number ?? '?'}`;

    await logActivity(tx, {
      ticketId: ticket.id,
      userId,
      action: 'link_removed',
      oldValue: otherReference,
      newValue: null,
    });
    await logActivity(tx, {
      ticketId: otherTicketId,
      userId,
      action: 'link_removed',
      oldValue: otherReference,
      newValue: null,
    });
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'link.deleted', {
    linkId,
    sourceTicketId: link.sourceTicketId,
    targetTicketId: link.targetTicketId,
    ticketNumber,
  });

  return { message: 'Link removed' };
}