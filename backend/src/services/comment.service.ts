import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound } from '../lib/app-error';
import { logActivity } from './activity.service';
import { broadcast } from '../lib/event-broadcaster';

// Resolves the authenticated user's role on a project.
// Throws 403 if the user is not a member of the project.
async function getUserProjectRole(userId: string, projectId: string): Promise<Role> {
  const member = await prisma.projectMember.findFirst({
    where: { userId, projectId },
  });
  if (!member) {
    throw forbidden();
  }
  return member.role;
}

// Throws 403 if the project is archived (mutations are blocked on archived projects).
// Deliberate deviation from ticket.service.ts which throws badRequest (400):
// Comments are a user-facing mutation tied to project membership context, and
// returning 403 provides consistent semantics with other membership-scoped guards.
async function assertProjectNotArchived(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, archivedAt: true },
  });
  if (!project) {
    throw notFound();
  }
  if (project.archivedAt !== null) {
    throw forbidden('Cannot modify an archived project');
  }
}

const USER_PREVIEW_SELECT = { id: true, displayName: true, avatarUrl: true } as const;

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

// Finds a comment by id and verifies it belongs to the given ticket. Throws 404 if either fails.
async function resolveComment(commentId: string, ticketId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
  });
  if (!comment || comment.ticketId !== ticketId) {
    throw notFound('Comment not found');
  }
  return comment;
}

// ─── listComments ─────────────────────────────────────────────────────────────

export async function listComments(userId: string, projectId: string, ticketNumber: number) {
  await getUserProjectRole(userId, projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);

  const comments = await prisma.comment.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: USER_PREVIEW_SELECT } },
  });

  return { comments };
}

// ─── createComment ────────────────────────────────────────────────────────────

export async function createComment(
  userId: string,
  projectId: string,
  ticketNumber: number,
  body: string,
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        ticketId: ticket.id,
        authorId: userId,
        body,
      },
      include: { author: { select: USER_PREVIEW_SELECT } },
    });

    const activityNewValue = body.length > 100 ? body.slice(0, 100) + '...' : body;
    await logActivity(tx, {
      ticketId: ticket.id,
      userId,
      action: 'commented',
      newValue: activityNewValue,
    });

    return created;
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'comment.created', { comment });

  return { comment };
}

// ─── updateComment ────────────────────────────────────────────────────────────

export async function updateComment(
  userId: string,
  projectId: string,
  ticketNumber: number,
  commentId: string,
  body: string,
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);
  const comment = await resolveComment(commentId, ticket.id);

  // Edit is author-only — no OWNER exception for updates
  if (comment.authorId !== userId) {
    throw forbidden();
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { body },
    include: { author: { select: USER_PREVIEW_SELECT } },
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'comment.updated', { comment: updated });

  return { comment: updated };
}

// ─── deleteComment ────────────────────────────────────────────────────────────

export async function deleteComment(
  userId: string,
  projectId: string,
  ticketNumber: number,
  commentId: string,
): Promise<void> {
  // VIEWER check comes first — before archive check — per test spec
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);
  const comment = await resolveComment(commentId, ticket.id);

  // Authors can delete their own comments; OWNERs can delete any comment (moderation)
  if (comment.authorId !== userId && role !== 'OWNER') {
    throw forbidden();
  }

  await prisma.comment.delete({ where: { id: commentId } });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'comment.deleted', { commentId, ticketId: ticket.id });
}
