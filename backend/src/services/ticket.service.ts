import { Prisma, Role, Priority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, badRequest, conflict } from '../lib/app-error';
import { logActivity } from './activity.service';
import { broadcast } from '../lib/event-broadcaster';
import { broadcastToDashboard } from '../lib/dashboard-event-broadcaster';
import { buildAttachmentRawUrl } from './ticket-attachment.service';

export type DueDateFilter = 'overdue' | 'today' | 'this_week' | 'this_month';

interface ResolvedDueDateRange {
  from: Date | null;
  to: Date | null;
  onlyPastDue: boolean;
}

function startOfDayLocal(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDayLocal(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function endOfWeekLocal(d: Date): Date {
  // Week ends Sunday 23:59:59.999 (project spec).
  const r = endOfDayLocal(d);
  const day = r.getDay(); // 0=Sun ... 6=Sat
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  r.setDate(r.getDate() + daysUntilSunday);
  return r;
}

function endOfMonthLocal(d: Date): Date {
  const r = endOfDayLocal(d);
  r.setMonth(r.getMonth() + 1, 0); // day 0 of next month = last day of current month
  return r;
}

function resolveDueDateRange(
  dueDateFrom: Date | undefined,
  dueDateTo: Date | undefined,
  dueDateFilter: DueDateFilter | undefined,
): ResolvedDueDateRange | null {
  // Raw range wins when present (regardless of whether dueDateFilter is also set).
  if (dueDateFrom || dueDateTo) {
    return {
      from: dueDateFrom ?? null,
      to: dueDateTo ?? null,
      onlyPastDue: false,
    };
  }
  if (!dueDateFilter) {
    return null;
  }
  const now = new Date();
  switch (dueDateFilter) {
    case 'overdue':
      return { from: null, to: now, onlyPastDue: true };
    case 'today':
      return { from: startOfDayLocal(now), to: endOfDayLocal(now), onlyPastDue: false };
    case 'this_week':
      return { from: now, to: endOfWeekLocal(now), onlyPastDue: false };
    case 'this_month':
      return { from: now, to: endOfMonthLocal(now), onlyPastDue: false };
  }
}

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
  attachments: {
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
  },
  targetLinks: {
    where: { type: 'BLOCKS' },
    select: { id: true },
  },
} as const;

// Flatten the junction-table labels into { id, name, color } as the frontend expects.
// Also derive a boolean `blockedBy` flag: true iff at least one BLOCKS link targets
// this ticket (via the `targetLinks` relation). The raw `targetLinks` shape is
// stripped from the output — only the boolean is surfaced.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// The `bytes` column is intentionally NOT included in the DTO — clients fetch
// attachment bytes lazily via `GET /api/v1/projects/<id>/tickets/<n>/attachments/<aid>/raw`.
// `projectId` is threaded in so the URL composition is centralized here.
function normalizeTicket(ticket: any, projectId: string) {
  const { labels, targetLinks, attachments, ...rest } = ticket;
  return {
    ...rest,
    labels: (labels ?? []).map((tl: { label: { id: string; name: string; color: string } }) => tl.label),
    blockedBy: (targetLinks ?? []).length > 0,
    attachments: (attachments ?? []).map(
      (a: {
        id: string;
        ticketId: string;
        uploaderId: string;
        uploader: { id: string; displayName: string };
        mimeType: string;
        originalName: string;
        sizeBytes: number;
        createdAt: Date;
      }) => ({
        id: a.id,
        ticketId: a.ticketId,
        uploaderId: a.uploaderId,
        uploaderDisplayName: a.uploader.displayName,
        url: buildAttachmentRawUrl(projectId, ticket.number, a.id),
        mimeType: a.mimeType,
        originalName: a.originalName,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt,
      }),
    ),
  };
}

const SORT_ORDER_GAP = 1000;

type SortKey =
  | 'sortOrder'
  | 'priority'
  | 'dueDate'
  | 'createdAt'
  | 'updatedAt'
  | 'number'
  | 'assignee';

type SortOrder = 'asc' | 'desc';

interface ListFilters {
  page?: number;
  pageSize?: number;
  statusColumnId?: string;
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  assigneeId?: string;
  labelId?: string;
  q?: string;
  sort?: SortKey;
  order?: SortOrder;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  dueDateFilter?: DueDateFilter;
}

// Priority rank used to break the alphabetical order of the Prisma enum.
// URGENT-first is the project semantic; matches the kanban board ordering.
const PRIORITY_RANK: Record<'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE', number> = {
  URGENT: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  NONE: 5,
};

// Map whitelisted sort/order inputs to a Prisma `orderBy` clause.
// `sort === 'priority'` is handled OUT OF DB (see listTickets) because
// Prisma's enum orderBy is alphabetical — wrong for priority semantics.
function buildOrderBy(
  sort: SortKey,
  order: SortOrder,
): Prisma.TicketOrderByWithRelationInput[] {
  switch (sort) {
    case 'priority':
      // Caller is expected to detect this and skip the DB orderBy path.
      return [];
    case 'assignee':
      return [{ assignee: { displayName: order } }, { id: 'asc' }];
    case 'dueDate':
      // Always put NULLs last regardless of direction so missing due dates
      // don't masquerade as "very old" or "in the future".
      return [{ dueDate: { sort: order, nulls: 'last' } }, { id: 'asc' }];
    case 'number':
    case 'sortOrder':
    case 'createdAt':
    case 'updatedAt':
      return [{ [sort]: order }, { id: 'asc' }];
  }
}

interface CreateTicketInput {
  title: string;
  description?: string;
  statusColumnId: string;
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  assigneeId?: string;
  dueDate?: string | null;
}

interface UpdateTicketInput {
  title?: string;
  description?: string;
  statusColumnId?: string;
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  assigneeId?: string | null;
  dueDate?: string | null;
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

function isInProgressColumnName(name: string | undefined | null): boolean {
  if (!name) return false;
  return name.toLowerCase().replace(/[_\s]+/g, ' ').trim() === 'in progress';
}

async function assertCanMoveToInProgress(targetColumnId: string, ticket: { assigneeId: string | null }): Promise<void> {
  if (ticket.assigneeId) return;
  const column = await prisma.statusColumn.findUnique({ where: { id: targetColumnId } });
  if (column && isInProgressColumnName(column.name)) {
    throw badRequest('Cannot move an unassigned ticket to "in progress"');
  }
}

// ─── overdue timers ──────────────────────────────────────────────────────────
//
// Per-process in-memory timer map keyed by ticketId. When a ticket's `dueDate`
// elapses, a `ticket.overdue` SSE event is broadcast on the project channel so
// connected clients can re-render the overdue badge.
//
// SINGLE-INSTANCE CONSTRAINT: this Map is per Node process. If the backend is
// ever scaled horizontally, a reschedule/cancel on one instance will not
// affect a timer scheduled on another — same constraint as the in-memory
// SSE broadcaster. NOT a persistent scheduler: timers do not survive a
// process restart; `rehydrateOverdueTimers` is a best-effort bounded catch-up
// that runs once at startup.
const overdueTimers = new Map<string, NodeJS.Timeout>();

function cancelOverdueTimer(ticketId: string): void {
  const existing = overdueTimers.get(ticketId);
  if (existing) {
    clearTimeout(existing);
  }
  overdueTimers.delete(ticketId);
}

async function onOverdueFire(ticketId: string, projectId: string): Promise<void> {
  // Always remove the map entry first so a re-scheduled timer can't double-fire.
  overdueTimers.delete(ticketId);
  try {
    const current = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!current) {
      return; // ticket was deleted; nothing to broadcast
    }
    if (!current.dueDate) {
      return; // dueDate was cleared; no overdue event
    }
    if (current.dueDate.getTime() > Date.now()) {
      return; // dueDate was pushed back into the future
    }
    // NOTE: broadcast is in-memory — single-instance only
    broadcast(projectId, 'ticket.overdue', { ticket: { id: ticketId, projectId } });
  } catch (err) {
    console.warn('[onOverdueFire] failed:', err instanceof Error ? err.message : String(err));
  }
}

function scheduleOverdueTimer(ticketId: string, projectId: string, dueDate: Date): void {
  // Idempotent reset on reschedule.
  cancelOverdueTimer(ticketId);
  const delay = dueDate.getTime() - Date.now();
  if (delay <= 0) {
    // Already overdue — broadcast immediately, no timer to store.
    // NOTE: broadcast is in-memory — single-instance only
    broadcast(projectId, 'ticket.overdue', { ticket: { id: ticketId, projectId } });
    return;
  }
  const handle = setTimeout(() => {
    void onOverdueFire(ticketId, projectId);
  }, delay);
  overdueTimers.set(ticketId, handle);
}

/**
 * Rehydrate overdue timers at startup. Best-effort and bounded: fetches at
 * most `take` tickets with a future `dueDate` and schedules a timer for each.
 *
 * KNOWN LIMITATIONS:
 *  - In-process only; not durable across restarts.
 *  - Tickets whose `dueDate` was already in the past at startup are NOT
 *    re-broadcast here — they show overdue on the next board load via
 *    `DueDateBadge` (client-side). A timer firing with no SSE subscribers
 *    is a no-op; we don't try to "catch up" already-past tickets here.
 *  - Capped at 1000 rows to avoid scanning huge tables on boot.
 */
export async function rehydrateOverdueTimers(): Promise<void> {
  const rows = await prisma.ticket.findMany({
    where: { dueDate: { gt: new Date() } },
    select: { id: true, projectId: true, dueDate: true },
    take: 1000,
  });
  for (const row of rows) {
    if (!row.dueDate) continue;
    scheduleOverdueTimer(row.id, row.projectId, row.dueDate);
  }
  console.log(`rehydrated ${rows.length} overdue timers`);
}

// ─── listTickets ──────────────────────────────────────────────────────────────

export async function listTickets(userId: string, projectId: string, filters: ListFilters) {
  await getUserProjectRole(userId, projectId);

  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 100);

  const where: Prisma.TicketWhereInput = { projectId };
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

  // Due-date filter: resolve the effective [from, to] range and add a
  // `where.dueDate` clause. Raw range wins over the convenience enum.
  // Null `dueDate` is naturally excluded by the gte/lte/lt predicates.
  const dueRange = resolveDueDateRange(filters.dueDateFrom, filters.dueDateTo, filters.dueDateFilter);
  if (dueRange) {
    if (dueRange.onlyPastDue) {
      where.dueDate = { lt: dueRange.to as Date };
    } else if (dueRange.from && dueRange.to) {
      where.dueDate = { gte: dueRange.from, lte: dueRange.to };
    } else if (dueRange.from) {
      where.dueDate = { gte: dueRange.from };
    } else if (dueRange.to) {
      where.dueDate = { lte: dueRange.to as Date };
    }
  }

  const sort: SortKey = filters.sort ?? 'sortOrder';
  const order: SortOrder = filters.order ?? 'asc';

  if (sort === 'priority') {
    // Priority ordering cannot be expressed in Prisma's enum orderBy
    // (it would sort alphabetically). Fetch all matching rows with the
    // stable id tie-breaker, sort in application code, then slice the
    // requested page. `total` is the unfiltered-by-sort match count.
    const all = await prisma.ticket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy: [{ id: 'asc' }],
    });
    const total = all.length;
    all.sort((a, b) => {
      const rankDiff =
        PRIORITY_RANK[a.priority as keyof typeof PRIORITY_RANK] -
        PRIORITY_RANK[b.priority as keyof typeof PRIORITY_RANK];
      if (rankDiff !== 0) {
        return order === 'asc' ? rankDiff : -rankDiff;
      }
      return a.id.localeCompare(b.id);
    });
    const start = (page - 1) * pageSize;
    const tickets = all.slice(start, start + pageSize);
    return { tickets: tickets.map((t) => normalizeTicket(t, projectId)), total, page, pageSize };
  }

  const orderBy = buildOrderBy(sort, order);

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return { tickets: tickets.map((t) => normalizeTicket(t, projectId)), total, page, pageSize };
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
    // preventing duplicate number allocation without requiring FOR UPDATE on an
    // aggregate (which PostgreSQL disallows).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(abs(hashtext(${projectId})))`;
    const rows = await tx.$queryRaw<Array<{ next_number: number }>>`
      SELECT COALESCE(MAX(number), 0) + 1 AS next_number
      FROM tickets WHERE project_id = ${projectId}
    `;
    const number = Number(rows[0]?.next_number ?? 1);

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
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        reporterId: userId,
        sortOrder,
      },
      include: TICKET_INCLUDE,
    });

    await logActivity(tx, { ticketId: created.id, userId, action: 'created' });

    return created;
  });

  const normalized = normalizeTicket(ticket, projectId);
  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'ticket.created', { ticket: normalized });
  if (normalized.assigneeId) {
    try {
      broadcastToDashboard(normalized.assigneeId, 'ticket.created', { ticket: normalized });
    } catch (err) {
      console.warn('[createTicket] broadcastToDashboard failed:', err);
    }
  }
  if (normalized.dueDate) {
    scheduleOverdueTimer(normalized.id, projectId, normalized.dueDate);
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

  return normalizeTicket(ticket, projectId);
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

  if (input.statusColumnId !== undefined) {
    await assertColumnInProject(projectId, input.statusColumnId);
  }
  if (
    input.statusColumnId !== undefined &&
    input.statusColumnId !== current.statusColumnId &&
    current.assigneeId === null
  ) {
    await assertCanMoveToInProgress(input.statusColumnId, current);
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
    if (input.dueDate !== undefined) {
      data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
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

    if (input.dueDate !== undefined) {
      const newDueDate = input.dueDate ? new Date(input.dueDate) : null;
      const newTime = newDueDate?.getTime() ?? null;
      const oldTime = current.dueDate?.getTime() ?? null;
      if (newTime !== oldTime) {
        const humanReadable = (value: Date | null): string | null => {
          if (!value) return null;
          const pad = (n: number) => String(n).padStart(2, '0');
          return (
            `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
            `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`
          );
        };
        if (newDueDate === null) {
          await logActivity(tx, {
            ticketId: current.id,
            userId,
            action: 'due_date_cleared',
            oldValue: humanReadable(current.dueDate),
            newValue: null,
          });
        } else {
          await logActivity(tx, {
            ticketId: current.id,
            userId,
            action: 'due_date_set',
            oldValue: humanReadable(current.dueDate),
            newValue: humanReadable(newDueDate),
          });
        }
      }
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

  const normalized = normalizeTicket(updated, projectId);
  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'ticket.updated', { ticket: normalized });
  if (normalized.assigneeId) {
    try {
      broadcastToDashboard(normalized.assigneeId, 'ticket.updated', { ticket: normalized });
    } catch (err) {
      console.warn('[updateTicket] broadcastToDashboard failed:', err);
    }
  }
  // Clear-and-reschedule on any dueDate change (including clearing to null).
  if (input.dueDate !== undefined) {
    cancelOverdueTimer(updated.id);
    if (normalized.dueDate) {
      scheduleOverdueTimer(updated.id, projectId, normalized.dueDate);
    }
  }

  return normalized;
}

// ─── deleteTicket ─────────────────────────────────────────────────────────────

export async function deleteTicket(
  userId: string,
  projectId: string,
  ticketNumber: number,
): Promise<{
  ticketNumber: number;
  deleted: true;
  deletedAt: Date;
  dependencies: {
    comments: number;
    linkedAsSource: number;
    linkedAsTarget: number;
    activityLogEntries: number;
    ticketLabels: number;
  };
}> {
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

  // Log before delete. The cascade on ticket deletion will remove this entry,
  // but activity is written for any in-flight consumers before the row is gone.
  await logActivity(prisma, { ticketId: ticket.id, userId, action: 'deleted' });

  // Count the dependent rows that the onDelete: Cascade rules will remove,
  // then delete the ticket — all in a single transaction so the counts reflect
  // exactly what was deleted.
  const dependencies = await prisma.$transaction(async (tx) => {
    const [comments, linkedAsSource, linkedAsTarget, activityLogEntries, ticketLabels] =
      await Promise.all([
        tx.comment.count({ where: { ticketId: ticket.id } }),
        tx.ticketLink.count({ where: { sourceTicketId: ticket.id } }),
        tx.ticketLink.count({ where: { targetTicketId: ticket.id } }),
        tx.activityLog.count({ where: { ticketId: ticket.id } }),
        tx.ticketLabel.count({ where: { ticketId: ticket.id } }),
      ]);
    await tx.ticket.delete({ where: { id: ticket.id } });
    return {
      comments,
      linkedAsSource,
      linkedAsTarget,
      activityLogEntries,
      ticketLabels,
    };
  });

  cancelOverdueTimer(ticket.id);

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

  return {
    ticketNumber,
    deleted: true,
    deletedAt: new Date(),
    dependencies,
  };
}

// ─── getDeletionImpact ────────────────────────────────────────────────────────

export async function getDeletionImpact(userId: string, projectId: string, ticketNumber: number) {
  // Membership check — throws 403 for non-members. VIEWERs are allowed to preview.
  await getUserProjectRole(userId, projectId);

  const ticket = await prisma.ticket.findFirst({
    where: { projectId, number: ticketNumber },
  });
  if (!ticket) {
    throw notFound('Ticket not found');
  }

  const dependencies = await prisma.$transaction(async (tx) => {
    const [comments, linkedAsSource, linkedAsTarget, activityLogEntries, ticketLabels] =
      await Promise.all([
        tx.comment.count({ where: { ticketId: ticket.id } }),
        tx.ticketLink.count({ where: { sourceTicketId: ticket.id } }),
        tx.ticketLink.count({ where: { targetTicketId: ticket.id } }),
        tx.activityLog.count({ where: { ticketId: ticket.id } }),
        tx.ticketLabel.count({ where: { ticketId: ticket.id } }),
      ]);

    return {
      comments,
      linkedAsSource,
      linkedAsTarget,
      activityLogEntries,
      ticketLabels,
    };
  });

  return {
    ticketNumber,
    dependencies,
  };
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
  const sourceTickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds }, projectId },
    select: { id: true, assigneeId: true, statusColumnId: true },
  });
  if (sourceTickets.length !== ticketIds.length) {
    throw badRequest('One or more tickets do not belong to this project');
  }
  const sourceById = new Map(sourceTickets.map((t) => [t.id, t]));

  // Guard: an unassigned ticket cannot be moved into an "in progress" column.
  for (const u of updates) {
    if (u.statusColumnId === undefined) continue;
    const source = sourceById.get(u.ticketId);
    if (!source || source.assigneeId !== null) continue;
    if (source.statusColumnId === u.statusColumnId) continue;
    await assertCanMoveToInProgress(u.statusColumnId, source);
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

// ─── bulkUpdate ───────────────────────────────────────────────────────────────

type BulkOperation =
  | 'status'
  | 'priority'
  | 'assignee'
  | 'addLabel'
  | 'removeLabel'
  | 'delete';

interface BulkUpdateArgs {
  ticketNumbers: number[];
  operation: BulkOperation;
  value?: string;
}

export async function bulkUpdate(
  userId: string,
  projectId: string,
  data: BulkUpdateArgs,
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER' && role !== 'MEMBER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  // Resolve tickets (full relations). Unknown / cross-project / already-deleted
  // numbers are silently skipped — the spec allows partial-batch handling here.
  const resolved = await prisma.ticket.findMany({
    where: { projectId, number: { in: data.ticketNumbers } },
    include: TICKET_INCLUDE,
  });

  if (resolved.length === 0) {
    return data.operation === 'delete' ? { deleted: 0, ticketNumbers: [] } : { updated: 0, tickets: [] };
  }

  // Preserve the input order for broadcasts / response shape.
  const sortedResolved = [...resolved].sort(
    (a, b) => data.ticketNumbers.indexOf(a.number) - data.ticketNumbers.indexOf(b.number),
  );
  const resolvedIds = sortedResolved.map((t) => t.id);

  const normalizeUpdatedTickets = (tickets: typeof sortedResolved) =>
    tickets.map((t) => normalizeTicket(t, projectId));

  switch (data.operation) {
    case 'status': {
      const column = await prisma.statusColumn.findFirst({
        where: { id: data.value, projectId },
      });
      if (!column) {
        throw badRequest('Status column does not belong to this project');
      }
      if (isInProgressColumnName(column.name)) {
        for (const oldTicket of sortedResolved) {
          if (oldTicket.statusColumnId === column.id) continue;
          if (oldTicket.assigneeId === null) {
            throw badRequest('Cannot move an unassigned ticket to "in progress"');
          }
        }
      }

      const updatedTickets = await prisma.$transaction(async (tx) => {
        await tx.ticket.updateMany({
          where: { id: { in: resolvedIds } },
          data: { statusColumnId: column.id },
        });
        const reloaded = await tx.ticket.findMany({
          where: { id: { in: resolvedIds } },
          include: TICKET_INCLUDE,
        });
        for (const oldTicket of sortedResolved) {
          if (oldTicket.statusColumnId === column.id) continue;
          await logActivity(tx, {
            ticketId: oldTicket.id,
            userId,
            action: 'status_changed',
            oldValue: oldTicket.statusColumnId,
            newValue: column.id,
          });
        }
        const orderMap = new Map(resolvedIds.map((id, idx) => [id, idx]));
        return reloaded.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      });

      const normalized = normalizeUpdatedTickets(updatedTickets);
      for (const t of normalized) {
        broadcast(projectId, 'ticket.updated', { ticket: t });
      }
      return { updated: normalized.length, tickets: normalized };
    }

    case 'priority': {
      const updatedTickets = await prisma.$transaction(async (tx) => {
        await tx.ticket.updateMany({
          where: { id: { in: resolvedIds } },
          data: { priority: data.value as Priority },
        });
        const reloaded = await tx.ticket.findMany({
          where: { id: { in: resolvedIds } },
          include: TICKET_INCLUDE,
        });
        for (const oldTicket of sortedResolved) {
          if (oldTicket.priority === data.value) continue;
          await logActivity(tx, {
            ticketId: oldTicket.id,
            userId,
            action: 'priority_changed',
            oldValue: oldTicket.priority,
            newValue: data.value,
          });
        }
        const orderMap = new Map(resolvedIds.map((id, idx) => [id, idx]));
        return reloaded.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      });

      const normalized = normalizeUpdatedTickets(updatedTickets);
      for (const t of normalized) {
        broadcast(projectId, 'ticket.updated', { ticket: t });
      }
      return { updated: normalized.length, tickets: normalized };
    }

    case 'assignee': {
      let assigneeId: string | null | undefined;
      if (data.value === 'UNASSIGN') {
        assigneeId = null;
      } else {
        const member = await prisma.projectMember.findFirst({
          where: { projectId, userId: data.value },
        });
        if (!member) {
          throw badRequest('Assignee is not a member of this project');
        }
        assigneeId = data.value;
      }

      const updatedTickets = await prisma.$transaction(async (tx) => {
        await tx.ticket.updateMany({
          where: { id: { in: resolvedIds } },
          data: { assigneeId: assigneeId },
        });
        const reloaded = await tx.ticket.findMany({
          where: { id: { in: resolvedIds } },
          include: TICKET_INCLUDE,
        });
        for (const oldTicket of sortedResolved) {
          if (oldTicket.assigneeId === assigneeId) continue;
          await logActivity(tx, {
            ticketId: oldTicket.id,
            userId,
            action: assigneeId === null ? 'unassigned' : 'assigned',
            oldValue: oldTicket.assigneeId,
            newValue: assigneeId,
          });
        }
        const orderMap = new Map(resolvedIds.map((id, idx) => [id, idx]));
        return reloaded.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      });

      const normalized = normalizeUpdatedTickets(updatedTickets);
      for (const t of normalized) {
        broadcast(projectId, 'ticket.updated', { ticket: t });
      }
      return { updated: normalized.length, tickets: normalized };
    }

    case 'addLabel': {
      const label = await prisma.label.findFirst({
        where: { id: data.value, projectId },
      });
      if (!label) {
        throw badRequest('Label does not belong to this project');
      }

      // Snapshot which tickets already had the label BEFORE we insert. Anything
      // present in `resolved` but missing from this set was newly added and gets
      // a `label_added` log entry.
      const preExistingLabelIds = new Set(
        sortedResolved
          .filter((t) =>
            t.labels.some(
              (tl: { label: { id: string } }) => tl.label.id === label.id,
            ),
          )
          .map((t) => t.id),
      );

      const affectedTickets = await prisma.$transaction(async (tx) => {
        await tx.ticketLabel.createMany({
          data: resolvedIds.map((id) => ({ ticketId: id, labelId: label.id })),
          skipDuplicates: true,
        });

        const reloaded = await tx.ticket.findMany({
          where: {
            id: { in: resolvedIds },
            labels: { some: { labelId: label.id } },
          },
          include: TICKET_INCLUDE,
        });

        for (const ticket of reloaded) {
          if (preExistingLabelIds.has(ticket.id)) continue;
          await logActivity(tx, {
            ticketId: ticket.id,
            userId,
            action: 'label_added',
            newValue: label.name,
          });
        }

        const orderMap = new Map(resolvedIds.map((id, idx) => [id, idx]));
        return reloaded.sort(
          (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
        );
      });

      const normalized = affectedTickets.map((t) => normalizeTicket(t, projectId));
      for (const t of normalized) {
        broadcast(projectId, 'ticket.updated', { ticket: t });
      }
      return { updated: normalized.length, tickets: normalized };
    }

    case 'removeLabel': {
      const label = await prisma.label.findFirst({
        where: { id: data.value, projectId },
      });
      if (!label) {
        throw badRequest('Label does not belong to this project');
      }

      const affectedTickets = await prisma.$transaction(async (tx) => {
        const existingRows = await tx.ticketLabel.findMany({
          where: { ticketId: { in: resolvedIds }, labelId: label.id },
          include: { label: true },
        });

        await tx.ticketLabel.deleteMany({
          where: { ticketId: { in: resolvedIds }, labelId: label.id },
        });

        for (const row of existingRows) {
          await logActivity(tx, {
            ticketId: row.ticketId,
            userId,
            action: 'label_removed',
            oldValue: row.label.name,
          });
        }

        // Build the post-state from the resolved tickets in memory, dropping
        // the removed label entry. This avoids a second `ticket.findMany` so
        // the broadcast `ticket.updated` shape stays correct without an extra
        // round-trip.
        return sortedResolved.map((t) => ({
          ...t,
          labels: t.labels.filter(
            (tl: { label: { id: string } }) => tl.label.id !== label.id,
          ),
        }));
      });

      const normalized = affectedTickets.map((t) => normalizeTicket(t, projectId));
      for (const t of normalized) {
        broadcast(projectId, 'ticket.updated', { ticket: t });
      }
      return { updated: normalized.length, tickets: normalized };
    }

    case 'delete': {
      const resolvedTickets = sortedResolved.map((t) => ({
        id: t.id,
        number: t.number,
        assigneeId: t.assigneeId,
      }));

      const deleteResult = await prisma.$transaction(async (tx) => {
        for (const t of resolvedTickets) {
          await logActivity(tx, {
            ticketId: t.id,
            userId,
            action: 'deleted',
            oldValue: t.assigneeId ?? undefined,
          });
        }
        const result = await tx.ticket.deleteMany({
          where: { id: { in: resolvedTickets.map((t) => t.id) } },
        });
        return result.count;
      });

      for (const t of resolvedTickets) {
        broadcast(projectId, 'ticket.deleted', { ticketId: t.id, number: t.number });
      }
      return {
        deleted: deleteResult,
        ticketNumbers: resolvedTickets.map((t) => t.number),
      };
    }

    default: {
      // Exhaustiveness check: if a new op is added, the compiler will flag this.
      const _exhaustive: never = data.operation;
      throw badRequest(`Unknown operation: ${String(_exhaustive)}`);
    }
  }
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
