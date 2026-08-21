import { prisma } from '../lib/prisma';
import { broadcast } from '../lib/event-broadcaster';
import { broadcastToDashboard } from '../lib/dashboard-event-broadcaster';
import { logActivity } from './activity.service';
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from './google-calendar.service';
import { getRefreshedAccessToken } from './google-oauth.service';
import { AppError, forbidden, badRequest, notFound } from '../lib/app-error';
import { boss } from '../lib/job-queue';

const USER_PREVIEW_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
} as const;

const REMINDER_QUEUE_PREFIX = 'meeting-reminder';

// ─── Private Helpers ──────────────────────────────────────────────────────────

async function getUserProjectRole(
  userId: string,
  projectId: string,
): Promise<string> {
  const member = await prisma.projectMember.findFirst({
    where: { userId, projectId },
  });
  if (!member) {
    throw forbidden();
  }
  return member.role;
}

async function assertProjectNotArchived(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { archivedAt: true },
  });
  if (!project || project.archivedAt !== null) {
    throw badRequest('Project is archived');
  }
}

async function resolveTicket(projectId: string, ticketNumber: number) {
  const ticket = await prisma.ticket.findFirst({
    where: { projectId, number: ticketNumber },
    include: { project: { select: { key: true } } },
  });
  if (!ticket) {
    throw notFound('Ticket not found');
  }
  return ticket;
}

async function resolveMeeting(meetingId: string, ticketId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
  });
  if (!meeting || meeting.ticketId !== ticketId) {
    throw notFound('Meeting not found');
  }
  return meeting;
}

async function getOAuthTokenForUser(userId: string): Promise<string> {
  const oauthAccount = await prisma.oAuthAccount.findFirst({
    where: { userId, provider: 'google' },
  });
  if (!oauthAccount?.refreshTokenEnc) {
    throw new AppError(502, 'Google account not connected');
  }
  try {
    return await getRefreshedAccessToken(oauthAccount.refreshTokenEnc);
  } catch (err: unknown) {
    const e = err as { message?: string };
    if (e?.message?.includes('invalid_grant')) {
      throw new AppError(401, 'Google token revoked — please reconnect your Google account');
    }
    throw new AppError(502, 'Failed to refresh Google token');
  }
}

async function scheduleReminderComment(meetingId: string, startTime: Date): Promise<void> {
  const jobName = `${REMINDER_QUEUE_PREFIX}:${meetingId}`;
  const reminderTime = new Date(startTime.getTime() - 15 * 60 * 1000);

  // Always cancel any existing reminder job first (best-effort)
  await boss.cancel(jobName).catch((err) => {
    console.warn(`[meeting-reminder] Could not cancel old reminder job for ${meetingId}:`, err);
  });

  if (reminderTime <= new Date()) return;

  await boss.send(jobName, { meetingId }, { startAfter: reminderTime });
}

// ─── listMeetings ─────────────────────────────────────────────────────────────

export async function listMeetings(
  userId: string,
  projectId: string,
  ticketNumber: number,
  options?: { cursor?: string },
) {
  await getUserProjectRole(userId, projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);

  const cursor = options?.cursor;
  const rows = await prisma.meeting.findMany({
    where: { ticketId: ticket.id },
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    include: { organizer: { select: USER_PREVIEW_SELECT } },
  });

  let nextCursor: string | null = null;
  let meetings;
  if (rows.length === 21) {
    nextCursor = rows[20].id;
    meetings = rows.slice(0, 20);
  } else {
    meetings = rows;
  }

  return { meetings, nextCursor };
}

// ─── scheduleMeeting ─────────────────────────────────────────────────────────

export async function scheduleMeeting(
  userId: string,
  projectId: string,
  ticketNumber: number,
  input: {
    title: string;
    startTime: Date | string;
    endTime: Date | string;
    attendeeEmails?: string[];
  },
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);

  const start = new Date(input.startTime as string);
  const end = new Date(input.endTime as string);

  if (start <= new Date()) {
    throw badRequest('startTime must be in the future');
  }
  if (end <= start) {
    throw badRequest('endTime must be after startTime');
  }

  const accessToken = await getOAuthTokenForUser(userId);
  const { googleEventId, meetLink } = await createCalendarEvent(accessToken, {
    title: input.title,
    startTime: start,
    endTime: end,
    attendeeEmails: input.attendeeEmails,
    trakkTicketId: ticket.id,
    trakkProjectId: projectId,
  });

  const meeting = await prisma.$transaction(async (tx) => {
    const m = await tx.meeting.create({
      data: {
        ticketId: ticket.id,
        organizerId: userId,
        googleEventId,
        meetLink,
        title: input.title,
        startTime: start,
        endTime: end,
      },
      include: { organizer: { select: USER_PREVIEW_SELECT } },
    });
    await logActivity(tx, {
      ticketId: ticket.id,
      userId,
      action: 'meeting_scheduled',
      newValue: input.title,
    });
    return m;
  });

  broadcast(projectId, 'meeting.created', { meeting });
  try {
    broadcastToDashboard(meeting.organizerId, 'meeting.created', { meeting });
  } catch (err) {
    console.warn('[scheduleMeeting] broadcastToDashboard failed:', err);
  }
  scheduleReminderComment(meeting.id, start).catch((err) => {
    console.warn('[scheduleMeeting] Failed to schedule reminder job:', err);
  });

  return { meeting };
}

// ─── updateMeeting ────────────────────────────────────────────────────────────

export async function updateMeeting(
  userId: string,
  projectId: string,
  ticketNumber: number,
  meetingId: string,
  input: {
    title?: string;
    startTime?: string;
    endTime?: string;
  },
) {
  const role = await getUserProjectRole(userId, projectId);
  await assertProjectNotArchived(projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);
  const meeting = await resolveMeeting(meetingId, ticket.id);

  if (role !== 'OWNER' && meeting.organizerId !== userId) {
    throw forbidden();
  }

  const resolvedTitle = input.title ?? meeting.title;
  const resolvedStart = input.startTime ? new Date(input.startTime) : meeting.startTime;
  const resolvedEnd = input.endTime ? new Date(input.endTime) : meeting.endTime;

  if (resolvedEnd <= resolvedStart) {
    throw badRequest('endTime must be after startTime');
  }

  const calendarUpdates: { title?: string; startTime?: Date; endTime?: Date } = {};
  if (input.title !== undefined) calendarUpdates.title = input.title;
  if (input.startTime !== undefined) calendarUpdates.startTime = new Date(input.startTime);
  if (input.endTime !== undefined) calendarUpdates.endTime = new Date(input.endTime);

  let calendarSyncFailed = false;
  try {
    const accessToken = await getOAuthTokenForUser(meeting.organizerId);
    await updateCalendarEvent(accessToken, meeting.googleEventId, calendarUpdates);
  } catch (err) {
    console.warn('[updateMeeting] Calendar update failed:', err);
    calendarSyncFailed = true;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.meeting.update({
      where: { id: meetingId },
      data: {
        title: resolvedTitle,
        startTime: resolvedStart,
        endTime: resolvedEnd,
      },
      include: { organizer: { select: USER_PREVIEW_SELECT } },
    });
    await logActivity(tx, {
      ticketId: ticket.id,
      userId,
      action: 'meeting_updated',
      newValue: resolvedTitle,
    });
    return m;
  });

  broadcast(projectId, 'meeting.updated', { meeting: updated });
  try {
    broadcastToDashboard(updated.organizerId, 'meeting.updated', { meeting: updated });
  } catch (err) {
    console.warn('[updateMeeting] broadcastToDashboard failed:', err);
  }

  if (input.startTime || input.endTime) {
    scheduleReminderComment(meeting.id, resolvedStart).catch((err) => {
      console.warn('[updateMeeting] Failed to reschedule reminder job:', err);
    });
  }

  if (calendarSyncFailed) {
    return {
      meeting: updated,
      warning: 'Calendar event could not be updated — changes saved locally only',
    };
  }
  return { meeting: updated };
}

// ─── cancelMeeting ────────────────────────────────────────────────────────────

export async function cancelMeeting(
  userId: string,
  projectId: string,
  ticketNumber: number,
  meetingId: string,
) {
  const role = await getUserProjectRole(userId, projectId);
  await assertProjectNotArchived(projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);
  const meeting = await resolveMeeting(meetingId, ticket.id);

  if (role !== 'OWNER' && meeting.organizerId !== userId) {
    throw forbidden();
  }

  try {
    const accessToken = await getOAuthTokenForUser(meeting.organizerId);
    await deleteCalendarEvent(accessToken, meeting.googleEventId);
  } catch (err) {
    console.warn('[cancelMeeting] Calendar deletion failed:', err);
  }

  // Cancel any pending reminder job for this meeting (best-effort)
  const jobName = `${REMINDER_QUEUE_PREFIX}:${meetingId}`;
  await boss.cancel(jobName).catch(() => {});

  await prisma.$transaction(async (tx) => {
    await tx.meeting.delete({ where: { id: meetingId } });
    await logActivity(tx, {
      ticketId: ticket.id,
      userId,
      action: 'meeting_cancelled',
      newValue: meeting.title,
    });
  });

  broadcast(projectId, 'meeting.deleted', { meetingId, ticketId: ticket.id });
  try {
    broadcastToDashboard(meeting.organizerId, 'meeting.deleted', {
      meetingId,
      ticketId: ticket.id,
    });
  } catch (err) {
    console.warn('[cancelMeeting] broadcastToDashboard failed:', err);
  }

  return { message: 'Meeting cancelled' };
}

// ─── startInstantMeeting ──────────────────────────────────────────────────────

export async function startInstantMeeting(
  userId: string,
  projectId: string,
  ticketNumber: number,
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role === 'VIEWER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);
  const ticket = await resolveTicket(projectId, ticketNumber);

  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
  const title = `Quick Meet — ${ticket.project.key}-${ticket.number}`;

  const accessToken = await getOAuthTokenForUser(userId);
  const { googleEventId, meetLink } = await createCalendarEvent(accessToken, {
    title,
    startTime,
    endTime,
    trakkTicketId: ticket.id,
    trakkProjectId: projectId,
  });

  const meeting = await prisma.$transaction(async (tx) => {
    const m = await tx.meeting.create({
      data: {
        ticketId: ticket.id,
        organizerId: userId,
        googleEventId,
        meetLink,
        title,
        startTime,
        endTime,
      },
      include: { organizer: { select: USER_PREVIEW_SELECT } },
    });
    await logActivity(tx, {
      ticketId: ticket.id,
      userId,
      action: 'meet_started',
      newValue: title,
    });
    return m;
  });

  broadcast(projectId, 'meeting.created', { meeting });
  try {
    broadcastToDashboard(meeting.organizerId, 'meeting.created', { meeting });
  } catch (err) {
    console.warn('[startInstantMeeting] broadcastToDashboard failed:', err);
  }

  try {
    const comment = await prisma.comment.create({
      data: {
        ticketId: ticket.id,
        authorId: userId,
        body: `Quick Meet started: ${meetLink}`,
      },
      include: { author: { select: USER_PREVIEW_SELECT } },
    });
    broadcast(projectId, 'comment.created', { comment });
  } catch (err) {
    console.warn('[startInstantMeeting] Failed to post Quick Meet comment:', err);
  }

  return { meeting };
}

// ─── registerReminderWorker ───────────────────────────────────────────────────

export async function registerReminderWorker(): Promise<void> {
  await boss.work(`${REMINDER_QUEUE_PREFIX}:*`, async (job: { data: { meetingId: string } }) => {
    const { meetingId } = job.data;
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        ticket: {
          include: { project: { select: { id: true } } },
        },
      },
    });
    if (!meeting) return;

    const comment = await prisma.comment.create({
      data: {
        body: `Reminder: "${meeting.title}" starts in 15 minutes.`,
        ticketId: meeting.ticketId,
        authorId: meeting.organizerId,
      },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    broadcast(meeting.ticket.project.id, 'comment.created', { comment });
  });
}

// ─── rehydrateMeetingReminders ────────────────────────────────────────────────

// No-op: job persistence is handled by pg-boss.
export async function rehydrateMeetingReminders(): Promise<void> {}
