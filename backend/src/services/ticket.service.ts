import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, badRequest, conflict } from '../lib/app-error';
import { logActivity } from './activity.service';
import { broadcast } from '../lib/event-broadcaster';
import { broadcastToDashboard } from '../lib/dashboard-event-broadcaster';
import { getRefreshedAccessToken } from './google-oauth.service';
import { deleteCalendarEvent } from './google-calendar.service';

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

// Throws 400 if the project is archived (mutations are blocked on archived projects).
async function assertProjectNotArchived(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, archivedAt: true },
  });
  if (!project) {
    throw notFound();
  }
  if (project.archivedAt !== null) {
    throw badRequest('Cannot modify an archived project');
  }
}

// Throws 400 if the ticket is archived. Archived tickets are read-only until
// restored. Deliberately badRequest (400) here — comment.service.ts uses
// forbidden (403) for the same guard; see CLAUDE.md.
function assertTicketNotArchived(ticket: { archivedAt: Date | null }): void {
  if (ticket.archivedAt) {
    throw badRequest('Cannot modify an archived ticket');
  }
}

const USER_PREVIEW_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
} as const;

const TICKET_INCLUDE = {
  assignee: { select: USER_PREVIEW_SELECT },
  reporter: { select: USER_PREVIEW_SELECT },
  statusColumn: { select: { id: true, name: true, position: true } },
  labels: { include: { label: true } },
} as const;

// Flatten the junction-table labels into { id, name, color } as the frontend expects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTicket(ticket: any) {
  const { labels, ...rest } = ticket;
  return {
    ...rest,
    labels: (labels ?? []).map((tl: { label: { id: string; name: string; color: string } }) => tl.label),
  };
}

const SORT_ORDER_GAP = 1000;

interface ListFilters {
  page?: number;
  pageSize?: number;
  statusColumnId?: string;
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  assigneeId?: string;
  labelId?: string;
  q?: string;
}

interface CreateTicketInput {
  title: string;
  description?: string;
  statusColumnId: string;
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  assigneeId?: string;
}

interface UpdateTicketInput {
  title?: string;
  description?: string;
  statusColumnId?: string;
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  assigneeId?: string | null;
}

interface ReorderUpdate {
  ticketId: string;
  sortOrder: number;
  statusColumnId?: string;
}

async function assertColumnInProject(projectId: string, statusColumnId: string): Promise<void> {
  const column = await prisma.statusColumn.findFirst({
    where: { id: statusColumnId, projectId },
  });
  if (!column) {
    throw badRequest('Status column does not belong to this project');
  }
}

async function assertAssigneeIsMember(projectId: string, assigneeId: string): Promise<void> {
  const member = await prisma.projectMember.findFirst({
    where: { userId: assigneeId, projectId },
  });
  if (!member) {
    throw badRequest('Assignee is not a member of this project');
  }
}

// ─── listTickets ──────────────────────────────────────────────────────────────

export async function listTickets(userId: string, projectId: string, filters: ListFilters) {
  await getUserProjectRole(userId, projectId);

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 100);

  // Archived tickets are hidden from every list view; they are reachable only
  // via the dedicated single-ticket fetch or the archive listing.
  const where: Prisma.TicketWhereInput = { projectId, archivedAt: null };
  if (filters.statusColumnId) {
    where.statusColumnId = filters.statusColumnId;
  }
  if (filters.priority) {
    where.priority = filters.priority;
  }
  if (filters.assigneeId) {
    where.assigneeId = filters.assigneeId;
  }
  if (filters.labelId) {
    where.labels = { some: { labelId: filters.labelId } };
  }

  // Full-text search: resolve matching IDs via the GIN-backed tsvector, then
  // constrain the main query to those IDs (never bypass with LIKE).
  if (filters.q && filters.q.trim().length > 0) {
    const matches = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM tickets
      WHERE project_id = ${projectId}
        AND to_tsvector('english', title || ' ' || COALESCE(description, ''))
            @@ plainto_tsquery('english', ${filters.q})
    `;
    const ids = matches.map((m) => m.id);
    if (ids.length === 0) {
      return { tickets: [], total: 0, page, pageSize };
    }
    where.id = { in: ids };
  }

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy: [{ statusColumnId: 'asc' }, { sortOrder: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return { tickets: tickets.map(normalizeTicket), total, page, pageSize };
}

// ─── createTicket ───────────────────────────────────────────────────────────

export async function createTicket(userId: string, projectId: string, input: CreateTicketInput) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);
  await assertColumnInProject(projectId, input.statusColumnId);
  if (input.assigneeId) {
    await assertAssigneeIsMember(projectId, input.assigneeId);
  }

  const ticket = await prisma.$transaction(async (tx) => {
    // Advisory lock serializes concurrent ticket creation for the same project,
    // so two callers can never read the same counter value before it increments.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(abs(hashtext(${projectId})))`;
    // The number comes from the monotonic per-project counter, never from
    // MAX(number): a hard deleted ticket's number must never be reused.
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { nextTicketNumber: true },
    });
    if (!project) {
      throw notFound();
    }
    const number = project.nextTicketNumber;

    const last = await tx.ticket.findFirst({
      where: { projectId, statusColumnId: input.statusColumnId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const sortOrder = (last?.sortOrder ?? 0) + SORT_ORDER_GAP;

    const created = await tx.ticket.create({
      data: {
        projectId,
        number,
        title: input.title,
        description: input.description ?? null,
        statusColumnId: input.statusColumnId,
        priority: input.priority ?? 'NONE',
        assigneeId: input.assigneeId ?? null,
        reporterId: userId,
        sortOrder,
      },
      include: TICKET_INCLUDE,
    });

    await tx.project.update({
      where: { id: projectId },
      data: { nextTicketNumber: { increment: 1 } },
    });

    await logActivity(tx, { ticketId: created.id, userId, action: 'created' });

    return created;
  });

  const normalized = normalizeTicket(ticket);
  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'ticket.created', { ticket: normalized });
  if (normalized.assigneeId) {
    try {
      broadcastToDashboard(normalized.assigneeId, 'ticket.created', { ticket: normalized });
    } catch (err) {
      console.warn('[createTicket] broadcastToDashboard failed:', err);
    }
  }

  return normalized;
}

// ─── getTicketByNumber ────────────────────────────────────────────────────────

export async function getTicketByNumber(userId: string, projectId: string, ticketNumber: number) {
  await getUserProjectRole(userId, projectId);

  const ticket = await prisma.ticket.findFirst({
    where: { projectId, number: ticketNumber },
    include: {
      ...TICKET_INCLUDE,
      activityLogs: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: { select: USER_PREVIEW_SELECT } },
      },
    },
  });
  if (!ticket) {
    throw notFound('Ticket not found');
  }

  return normalizeTicket(ticket);
}

// ─── updateTicket ─────────────────────────────────────────────────────────────

export async function updateTicket(
  userId: string,
  projectId: string,
  ticketNumber: number,
  input: UpdateTicketInput,
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  const current = await prisma.ticket.findFirst({
    where: { projectId, number: ticketNumber },
  });
  if (!current) {
    throw notFound('Ticket not found');
  }
  assertTicketNotArchived(current);

  if (input.statusColumnId !== undefined) {
    await assertColumnInProject(projectId, input.statusColumnId);
  }
  if (input.assigneeId !== undefined && input.assigneeId !== null) {
    await assertAssigneeIsMember(projectId, input.assigneeId);
  }

  // Resolve column names for the status_changed log entry.
  let oldColumnName: string | null = null;
  let newColumnName: string | null = null;
  if (input.statusColumnId !== undefined && input.statusColumnId !== current.statusColumnId) {
    const [oldCol, newCol] = await Promise.all([
      prisma.statusColumn.findFirst({ where: { id: current.statusColumnId } }),
      prisma.statusColumn.findFirst({ where: { id: input.statusColumnId } }),
    ]);
    oldColumnName = oldCol?.name ?? null;
    newColumnName = newCol?.name ?? null;
  }

  // Resolve assignee display names for assigned/unassigned log entries.
  let oldAssigneeName: string | null = null;
  let newAssigneeName: string | null = null;
  if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
    if (current.assigneeId) {
      const old = await prisma.user.findUnique({ where: { id: current.assigneeId } });
      oldAssigneeName = old?.displayName ?? null;
    }
    if (input.assigneeId) {
      const next = await prisma.user.findUnique({ where: { id: input.assigneeId } });
      newAssigneeName = next?.displayName ?? null;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const data: Prisma.TicketUpdateInput = {};
    if (input.title !== undefined) {
      data.title = input.title;
    }
    if (input.description !== undefined) {
      data.description = input.description;
    }
    if (input.statusColumnId !== undefined) {
      data.statusColumn = { connect: { id: input.statusColumnId } };
    }
    if (input.priority !== undefined) {
      data.priority = input.priority;
    }
    if (input.assigneeId !== undefined) {
      data.assignee = input.assigneeId
        ? { connect: { id: input.assigneeId } }
        : { disconnect: true };
    }

    const ticket = await tx.ticket.update({
      where: { id: current.id },
      data,
      include: TICKET_INCLUDE,
    });

    if (input.title !== undefined && input.title !== current.title) {
      await logActivity(tx, {
        ticketId: current.id,
        userId,
        action: 'title_updated',
        oldValue: current.title,
        newValue: input.title,
      });
    }

    if (input.description !== undefined && input.description !== current.description) {
      const oldValue =
        current.description != null && current.description.length > 200
          ? current.description.slice(0, 200)
          : current.description;
      await logActivity(tx, {
        ticketId: current.id,
        userId,
        action: 'description_updated',
        oldValue,
        // New description can be arbitrarily long — not stored in the log.
        newValue: null,
      });
    }

    if (input.statusColumnId !== undefined && input.statusColumnId !== current.statusColumnId) {
      await logActivity(tx, {
        ticketId: current.id,
        userId,
        action: 'status_changed',
        oldValue: oldColumnName,
        newValue: newColumnName,
      });
    }

    if (input.priority !== undefined && input.priority !== current.priority) {
      await logActivity(tx, {
        ticketId: current.id,
        userId,
        action: 'priority_changed',
        oldValue: current.priority,
        newValue: input.priority,
      });
    }

    if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
      if (input.assigneeId) {
        await logActivity(tx, {
          ticketId: current.id,
          userId,
          action: 'assigned',
          oldValue: oldAssigneeName,
          newValue: newAssigneeName,
        });
      } else {
        await logActivity(tx, {
          ticketId: current.id,
          userId,
          action: 'unassigned',
          oldValue: oldAssigneeName,
          newValue: null,
        });
      }
    }

    return ticket;
  });

  const normalized = normalizeTicket(updated);
  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'ticket.updated', { ticket: normalized });
  if (normalized.assigneeId) {
    try {
      broadcastToDashboard(normalized.assigneeId, 'ticket.updated', { ticket: normalized });
    } catch (err) {
      console.warn('[updateTicket] broadcastToDashboard failed:', err);
    }
  }

  return normalized;
}

// ─── deleteTicket ─────────────────────────────────────────────────────────────

export async function deleteTicket(
  userId: string,
  projectId: string,
  ticketNumber: number,
): Promise<void> {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  const ticket = await prisma.ticket.findFirst({
    where: { projectId, number: ticketNumber },
    include: {
      meetings: { select: { id: true, googleEventId: true, organizerId: true } },
    },
  });
  if (!ticket) {
    throw notFound('Ticket not found');
  }

  // Best-effort Google Calendar cleanup — never block deletion on it.
  for (const meeting of ticket.meetings) {
    if (!meeting.googleEventId) {
      continue;
    }
    try {
      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: { userId: meeting.organizerId, provider: 'google' },
      });
      if (!oauthAccount?.refreshTokenEnc) {
        continue;
      }
      const accessToken = await getRefreshedAccessToken(oauthAccount.refreshTokenEnc);
      await deleteCalendarEvent(accessToken, meeting.googleEventId);
    } catch (err) {
      console.warn(
        `Failed to delete Google Calendar event for meeting ${meeting.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Log before delete. The cascade on ticket deletion will remove this entry,
  // but activity is written for any in-flight consumers before the row is gone.
  await logActivity(prisma, { ticketId: ticket.id, userId, action: 'deleted' });

  await prisma.ticket.delete({ where: { id: ticket.id } });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'ticket.deleted', { ticketId: ticket.id, number: ticketNumber });
  if (ticket.assigneeId) {
    try {
      broadcastToDashboard(ticket.assigneeId, 'ticket.deleted', {
        ticketId: ticket.id,
        number: ticketNumber,
      });
    } catch (err) {
      console.warn('[deleteTicket] broadcastToDashboard failed:', err);
    }
  }
}

// ─── toggleArchiveTicket ──────────────────────────────────────────────────────

export async function toggleArchiveTicket(
  userId: string,
  projectId: string,
  ticketNumber: number,
  archive: boolean,
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  // Archiving is a mutation and is blocked on an archived project. Restoring is
  // deliberately allowed so a project can be unarchived ticket-by-ticket.
  if (archive) {
    await assertProjectNotArchived(projectId);
  }

  // Not filtered by archivedAt — the lookup must find the ticket in either state
  // so that both archive and restore resolve it.
  const ticket = await prisma.ticket.findFirst({
    where: { projectId, number: ticketNumber },
  });
  if (!ticket) {
    throw notFound('Ticket not found');
  }

  // Written unconditionally, with no pre-check on the current state, so a
  // repeated call is an idempotent no-op rather than an error.
  // No Meeting or Google Calendar interaction: archiving is not a cancellation.
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.ticket.update({
      where: { id: ticket.id },
      data: { archivedAt: archive ? new Date() : null },
      include: TICKET_INCLUDE,
    });

    await logActivity(tx, {
      ticketId: ticket.id,
      userId,
      action: archive ? 'archived' : 'restored',
    });

    return result;
  });

  const normalized = normalizeTicket(updated);
  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'ticket.updated', { ticket: normalized });
  if (normalized.assigneeId) {
    try {
      broadcastToDashboard(normalized.assigneeId, 'ticket.updated', { ticket: normalized });
    } catch (err) {
      console.warn('[toggleArchiveTicket] broadcastToDashboard failed:', err);
    }
  }

  return normalized;
}

// ─── reorderTickets ───────────────────────────────────────────────────────────

export async function reorderTickets(
  userId: string,
  projectId: string,
  updates: ReorderUpdate[],
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  const ticketIds = updates.map((u) => u.ticketId);
  // archivedAt: null hardens this against a stale client trying to reorder an
  // archived ticket — such an ID fails the ownership count and is rejected.
  const count = await prisma.ticket.count({
    where: { id: { in: ticketIds }, projectId, archivedAt: null },
  });
  if (count !== ticketIds.length) {
    throw badRequest('One or more tickets do not belong to this project');
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.ticket.update({
        where: { id: u.ticketId },
        data: {
          sortOrder: u.sortOrder,
          ...(u.statusColumnId !== undefined ? { statusColumnId: u.statusColumnId } : {}),
        },
      }),
    ),
  );

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'ticket.reordered', { updates });

  return { updated: updates.length };
}

// ─── addLabelToTicket ─────────────────────────────────────────────────────────

export async function addLabelToTicket(
  userId: string,
  projectId: string,
  ticketNumber: number,
  labelId: string,
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  const label = await prisma.label.findFirst({ where: { id: labelId, projectId } });
  if (!label) {
    throw badRequest('Label does not belong to this project');
  }

  const ticket = await prisma.ticket.findFirst({
    where: { projectId, number: ticketNumber },
  });
  if (!ticket) {
    throw notFound('Ticket not found');
  }
  assertTicketNotArchived(ticket);

  const existing = await prisma.ticketLabel.findUnique({
    where: { ticketId_labelId: { ticketId: ticket.id, labelId } },
  });
  if (existing) {
    throw conflict('Label is already assigned to this ticket');
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticketLabel.create({ data: { ticketId: ticket.id, labelId } });
    await logActivity(tx, {
      ticketId: ticket.id,
      userId,
      action: 'label_added',
      newValue: label.name,
    });
  });

  const rawLabels = await prisma.ticketLabel.findMany({
    where: { ticketId: ticket.id },
    include: { label: true },
  });
  const labels = rawLabels.map((tl) => tl.label);

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'ticket.updated', { ticket: { id: ticket.id, labels } });

  return { id: ticket.id, labels };
}

// ─── removeLabelFromTicket ────────────────────────────────────────────────────

export async function removeLabelFromTicket(
  userId: string,
  projectId: string,
  ticketNumber: number,
  labelId: string,
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  const ticket = await prisma.ticket.findFirst({
    where: { projectId, number: ticketNumber },
  });
  if (!ticket) {
    throw notFound('Ticket not found');
  }
  assertTicketNotArchived(ticket);

  const existing = await prisma.ticketLabel.findUnique({
    where: { ticketId_labelId: { ticketId: ticket.id, labelId } },
    include: { label: true },
  });
  if (!existing) {
    throw notFound('Label is not assigned to this ticket');
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticketLabel.delete({
      where: { ticketId_labelId: { ticketId: ticket.id, labelId } },
    });
    await logActivity(tx, {
      ticketId: ticket.id,
      userId,
      action: 'label_removed',
      oldValue: existing.label.name,
    });
  });

  const rawLabels = await prisma.ticketLabel.findMany({
    where: { ticketId: ticket.id },
    include: { label: true },
  });
  const labels = rawLabels.map((tl) => tl.label);

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'ticket.updated', { ticket: { id: ticket.id, labels } });

  return { id: ticket.id, labels };
}
