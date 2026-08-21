// @ts-nocheck
// Mock prisma, google services, activity service, and broadcaster before importing.
// $transaction is wired to pass the same mock object as tx so that
// assertions on mockPrisma work regardless of whether calls are made
// on the top-level prisma or inside a transaction.

const mockBroadcast = jest.fn();
const mockBroadcastToDashboard = jest.fn();
const mockLogActivity = jest.fn();
const mockCreateCalendarEvent = jest.fn();
const mockUpdateCalendarEvent = jest.fn();
const mockDeleteCalendarEvent = jest.fn();
const mockGetRefreshedAccessToken = jest.fn();

// pg-boss mock — must be hoisted before any import of meeting.service
jest.mock('../lib/job-queue', () => ({
  boss: {
    cancel: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue('mock-job-id'),
    work: jest.fn().mockResolvedValue(undefined),
  },
}));

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
    meeting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    comment: {
      create: jest.fn(),
    },
    activityLog: {
      create: jest.fn(),
    },
    oAuthAccount: {
      findFirst: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(async (cb) => cb(db));
  return { prisma: db };
});

jest.mock('../lib/event-broadcaster', () => ({
  broadcast: mockBroadcast,
}));

jest.mock('../lib/dashboard-event-broadcaster', () => ({
  broadcastToDashboard: mockBroadcastToDashboard,
}));

jest.mock('./activity.service', () => ({
  logActivity: mockLogActivity,
}));

jest.mock('../services/google-calendar.service', () => ({
  createCalendarEvent: mockCreateCalendarEvent,
  updateCalendarEvent: mockUpdateCalendarEvent,
  deleteCalendarEvent: mockDeleteCalendarEvent,
}));

jest.mock('../services/google-oauth.service', () => ({
  getRefreshedAccessToken: mockGetRefreshedAccessToken,
}));

import { prisma } from '../lib/prisma';
import { boss } from '../lib/job-queue';
import {
  listMeetings,
  scheduleMeeting,
  updateMeeting,
  cancelMeeting,
  startInstantMeeting,
  rehydrateMeetingReminders,
  registerReminderWorker,
} from './meeting.service';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockBoss = boss as jest.Mocked<typeof boss>;

// UUIDs
const USER_ID        = '550e8400-e29b-4d41-a716-446655440001';
const OTHER_USER_ID  = '550e8400-e29b-4d41-a716-446655440002';
const PROJECT_ID     = '550e8400-e29b-4d41-a716-446655440010';
const TICKET_ID      = '550e8400-e29b-4d41-a716-446655440020';
const MEETING_ID     = '550e8400-e29b-4d41-a716-446655440030';
const TICKET_NUMBER  = 5;

const NOW       = new Date('2026-06-12T12:00:00Z');
const START_TIME = new Date('2027-01-01T14:00:00Z');
const END_TIME   = new Date('2027-01-01T15:00:00Z');

const MOCK_MEMBER_MEMBERSHIP = {
  id: 'member-uuid-1',
  userId: USER_ID,
  projectId: PROJECT_ID,
  role: 'MEMBER' as const,
  joinedAt: new Date('2024-01-01'),
};

const MOCK_OWNER_MEMBERSHIP = {
  ...MOCK_MEMBER_MEMBERSHIP,
  role: 'OWNER' as const,
};

const MOCK_VIEWER_MEMBERSHIP = {
  ...MOCK_MEMBER_MEMBERSHIP,
  role: 'VIEWER' as const,
};

const MOCK_ACTIVE_PROJECT = {
  id: PROJECT_ID,
  name: 'Test Project',
  key: 'TST',
  archivedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const MOCK_TICKET = {
  id: TICKET_ID,
  projectId: PROJECT_ID,
  number: TICKET_NUMBER,
  title: 'Fix the bug',
  key: 'TST',
};

const MOCK_OAUTH_ACCOUNT = {
  id: 'oauth-uuid-1',
  userId: USER_ID,
  provider: 'google',
  providerId: 'google-sub-1',
  accessTokenEnc: 'enc-access-token',
  refreshTokenEnc: 'enc-refresh-token',
};

const MOCK_MEETING = {
  id: MEETING_ID,
  ticketId: TICKET_ID,
  organizerId: USER_ID,
  googleEventId: 'google-event-id-1',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  title: 'Planning session',
  startTime: START_TIME,
  endTime: END_TIME,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  organizer: {
    id: USER_ID,
    displayName: 'Alice Smith',
    avatarUrl: null,
    email: 'alice@example.com',
  },
};

// Ticket with project included (for resolveTicket / project key lookup)
const MOCK_TICKET_WITH_PROJECT = {
  ...MOCK_TICKET,
  project: MOCK_ACTIVE_PROJECT,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Re-apply $transaction pass-through after clearAllMocks wipes implementations.
  (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(mockPrisma));
  // Default: access token refresh succeeds
  mockGetRefreshedAccessToken.mockResolvedValue('fresh-access-token');
  // Default: calendar event created successfully
  mockCreateCalendarEvent.mockResolvedValue({
    googleEventId: 'google-event-id-1',
    meetLink: 'https://meet.google.com/abc-defg-hij',
  });
  // Default: oauth account exists
  mockPrisma.oAuthAccount.findFirst.mockResolvedValue(MOCK_OAUTH_ACCOUNT);
  // Default: active project
  mockPrisma.project.findUnique.mockResolvedValue(MOCK_ACTIVE_PROJECT);
});

// ─── scheduleMeeting ─────────────────────────────────────────────────────────

describe('scheduleMeeting', () => {
  it('happy path — MEMBER, creates meeting, logs activity, broadcasts meeting.created', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
    mockPrisma.meeting.create.mockResolvedValue(MOCK_MEETING);
    mockLogActivity.mockResolvedValue(undefined);

    // Act
    const result = await scheduleMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, {
      title: 'Planning session',
      startTime: START_TIME,
      endTime: END_TIME,
    });

    // Assert
    expect(result).toMatchObject({ meeting: expect.objectContaining({ id: MEETING_ID }) });
    expect(mockCreateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(mockPrisma.meeting.create).toHaveBeenCalledTimes(1);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'meeting_scheduled' }),
    );
    expect(mockBroadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'meeting.created',
      expect.objectContaining({ meeting: expect.anything() }),
    );
  });

  it('VIEWER role throws 403 before any Calendar call', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_VIEWER_MEMBERSHIP);

    // Act & Assert
    await expect(
      scheduleMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        title: 'Viewer trying to schedule',
        startTime: START_TIME,
        endTime: END_TIME,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
    expect(mockPrisma.meeting.create).not.toHaveBeenCalled();
  });

  it('Calendar failure prevents meeting from being persisted', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
    mockCreateCalendarEvent.mockRejectedValue(new Error('Calendar API error'));

    // Act & Assert
    await expect(
      scheduleMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        title: 'Planning session',
        startTime: START_TIME,
        endTime: END_TIME,
      }),
    ).rejects.toThrow();
    expect(mockPrisma.meeting.create).not.toHaveBeenCalled();
  });

  it('endTime <= startTime throws 400 before Calendar call', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);

    const sameTime = new Date('2027-01-01T14:00:00Z');

    // Act & Assert — endTime equals startTime
    await expect(
      scheduleMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        title: 'Invalid times',
        startTime: sameTime,
        endTime: sameTime,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });

  it('no Google OAuth account throws 502', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
    mockPrisma.oAuthAccount.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expect(
      scheduleMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        title: 'Planning session',
        startTime: START_TIME,
        endTime: END_TIME,
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
    expect(mockPrisma.meeting.create).not.toHaveBeenCalled();
  });

  it('throws 403 when user is not a project member', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expect(
      scheduleMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        title: 'Planning session',
        startTime: START_TIME,
        endTime: END_TIME,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
    expect(mockPrisma.meeting.create).not.toHaveBeenCalled();
  });
});

// ─── listMeetings ─────────────────────────────────────────────────────────────

describe('listMeetings', () => {
  it('Viewer can list meetings; 21 rows returned → nextCursor = rows[20].id, meetings = first 20', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_VIEWER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);

    const twentyOneMeetings = Array.from({ length: 21 }, (_, i) => ({
      ...MOCK_MEETING,
      id: `meeting-id-${i}`,
    }));
    mockPrisma.meeting.findMany.mockResolvedValue(twentyOneMeetings);

    // Act
    const result = await listMeetings(USER_ID, PROJECT_ID, TICKET_NUMBER, {});

    // Assert
    expect(result.meetings).toHaveLength(20);
    expect(result.nextCursor).toBe('meeting-id-20');
  });
});

// ─── updateMeeting ─────────────────────────────────────────────────────────────

describe('updateMeeting', () => {
  it('happy path — organizer updates title and times, Calendar updated, returns { meeting } with no warning', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    mockPrisma.meeting.findUnique.mockResolvedValue(MOCK_MEETING);
    const updatedMeeting = { ...MOCK_MEETING, title: 'New title' };
    mockPrisma.meeting.update.mockResolvedValue(updatedMeeting);
    mockUpdateCalendarEvent.mockResolvedValue(undefined);

    const newEnd = new Date('2027-01-01T16:00:00Z');

    // Act
    const result = await updateMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID, {
      title: 'New title',
      startTime: START_TIME,
      endTime: newEnd,
    });

    // Assert
    expect(result).toMatchObject({ meeting: expect.objectContaining({ title: 'New title' }) });
    expect(result.warning).toBeUndefined();
    expect(mockUpdateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(mockPrisma.meeting.update).toHaveBeenCalledTimes(1);
  });

  it('non-organizer MEMBER throws 403', async () => {
    // Arrange — USER_ID is MEMBER but meeting was organized by OTHER_USER_ID
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    mockPrisma.meeting.findUnique.mockResolvedValue({
      ...MOCK_MEETING,
      organizerId: OTHER_USER_ID,
    });

    // Act & Assert
    await expect(
      updateMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID, { title: 'New title' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.meeting.update).not.toHaveBeenCalled();
  });

  it('OWNER non-organizer can update meeting', async () => {
    // Arrange — USER_ID is OWNER; meeting was organized by OTHER_USER_ID
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_OWNER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    const meetingByOther = { ...MOCK_MEETING, organizerId: OTHER_USER_ID };
    mockPrisma.meeting.findUnique.mockResolvedValue(meetingByOther);
    // Organizer's oauth account for Calendar call
    mockPrisma.oAuthAccount.findFirst.mockResolvedValue(MOCK_OAUTH_ACCOUNT);
    const updatedMeeting = { ...meetingByOther, title: 'Owner override title' };
    mockPrisma.meeting.update.mockResolvedValue(updatedMeeting);
    mockUpdateCalendarEvent.mockResolvedValue(undefined);

    // Act
    const result = await updateMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID, {
      title: 'Owner override title',
    });

    // Assert — succeeds, DB updated
    expect(result).toMatchObject({ meeting: expect.objectContaining({ title: 'Owner override title' }) });
    expect(mockPrisma.meeting.update).toHaveBeenCalledTimes(1);
  });

  it('Calendar failure still updates DB and returns warning', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    mockPrisma.meeting.findUnique.mockResolvedValue(MOCK_MEETING);
    mockUpdateCalendarEvent.mockRejectedValue(new Error('Calendar unavailable'));
    const updatedMeeting = { ...MOCK_MEETING, title: 'Updated anyway' };
    mockPrisma.meeting.update.mockResolvedValue(updatedMeeting);

    // Act
    const result = await updateMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID, {
      title: 'Updated anyway',
    });

    // Assert — DB updated, warning present
    expect(mockPrisma.meeting.update).toHaveBeenCalledTimes(1);
    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/Calendar event could not be updated/);
  });

  it('throws 403 when user is not a project member', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expect(
      updateMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID, { title: 'New title' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.meeting.update).not.toHaveBeenCalled();
  });
});

// ─── cancelMeeting ─────────────────────────────────────────────────────────────

describe('cancelMeeting', () => {
  it('Calendar failure: meeting still deleted from DB, returns { message }', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    mockPrisma.meeting.findUnique.mockResolvedValue(MOCK_MEETING);
    mockDeleteCalendarEvent.mockRejectedValue(new Error('Calendar delete failed'));
    mockPrisma.meeting.delete.mockResolvedValue(MOCK_MEETING);
    mockLogActivity.mockResolvedValue(undefined);

    // Act
    const result = await cancelMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID);

    // Assert — delete went through despite Calendar failure
    expect(mockPrisma.meeting.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MEETING_ID } }),
    );
    expect(result).toMatchObject({ message: 'Meeting cancelled' });
  });

  it('throws 403 when user is not a project member', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expect(
      cancelMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.meeting.delete).not.toHaveBeenCalled();
  });
});

// ─── startInstantMeeting ──────────────────────────────────────────────────────

describe('startInstantMeeting', () => {
  it('happy path — 30-min duration, title format Quick Meet — KEY-NUM, activity logged, comment created, returns { meeting }', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
    const instantMeeting = {
      ...MOCK_MEETING,
      title: 'Quick Meet — TST-5',
      endTime: new Date(START_TIME.getTime() + 30 * 60 * 1000),
    };
    mockPrisma.meeting.create.mockResolvedValue(instantMeeting);
    mockPrisma.comment.create.mockResolvedValue({
      id: 'comment-uuid-instant',
      ticketId: TICKET_ID,
      authorId: USER_ID,
      body: 'Quick meet started',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockLogActivity.mockResolvedValue(undefined);

    // Act
    const result = await startInstantMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER);

    // Assert
    expect(result).toMatchObject({ meeting: expect.anything() });
    expect(mockPrisma.meeting.create).toHaveBeenCalledTimes(1);
    // Title should contain the Quick Meet prefix
    const createCall = mockPrisma.meeting.create.mock.calls[0][0];
    expect(createCall.data.title).toMatch(/Quick Meet/);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'meet_started' }),
    );
  });

  it('comment creation failure does not prevent meeting from being returned', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
    mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
    mockPrisma.meeting.create.mockResolvedValue(MOCK_MEETING);
    mockPrisma.comment.create.mockRejectedValue(new Error('Comment creation failed'));
    mockLogActivity.mockResolvedValue(undefined);

    // Act — should resolve, not reject
    const result = await startInstantMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER);

    // Assert — meeting still returned despite comment failure
    expect(result).toMatchObject({ meeting: expect.anything() });
  });

  it('throws 403 when user is not a project member', async () => {
    // Arrange
    mockPrisma.projectMember.findFirst.mockResolvedValue(null);

    // Act & Assert
    await expect(
      startInstantMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockPrisma.meeting.create).not.toHaveBeenCalled();
  });
});

// ─── rehydrateMeetingReminders ────────────────────────────────────────────────

describe('rehydrateMeetingReminders', () => {
  it('is a no-op stub — resolves without querying DB or scheduling anything', async () => {
    // Act
    await expect(rehydrateMeetingReminders()).resolves.toBeUndefined();

    // Assert — no DB calls made (pg-boss owns rehydration now)
    expect(mockPrisma.meeting.findMany).not.toHaveBeenCalled();
  });
});

// ─── pg-boss meeting reminders ─────────────────────────────────────────────────

describe('pg-boss meeting reminders', () => {
  const REMINDER_JOB_NAME = `meeting-reminder:${MEETING_ID}`;

  beforeEach(() => {
    // Re-apply boss mock implementations after clearAllMocks
    (mockBoss.cancel as jest.Mock).mockResolvedValue(undefined);
    (mockBoss.send as jest.Mock).mockResolvedValue('mock-job-id');
    (mockBoss.work as jest.Mock).mockResolvedValue(undefined);
  });

  // ─── scheduleMeeting + pg-boss ────────────────────────────────────────────

  describe('scheduleMeeting with pg-boss', () => {
    it('calls boss.cancel() with the correct job name before boss.send()', async () => {
      // Arrange
      mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
      mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
      mockPrisma.meeting.create.mockResolvedValue(MOCK_MEETING);
      mockLogActivity.mockResolvedValue(undefined);

      // Act
      await scheduleMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        title: 'Planning session',
        startTime: START_TIME,
        endTime: END_TIME,
      });
      // Flush microtasks so the fire-and-forget scheduleReminderComment resolves
      await new Promise<void>((resolve) => setImmediate(resolve));

      // Assert — cancel called before send (order matters)
      expect(mockBoss.cancel).toHaveBeenCalledWith(REMINDER_JOB_NAME);
      const cancelOrder = (mockBoss.cancel as jest.Mock).mock.invocationCallOrder[0];
      const sendOrder = (mockBoss.send as jest.Mock).mock.invocationCallOrder[0];
      expect(cancelOrder).toBeLessThan(sendOrder);
    });

    it('calls boss.send() with correct jobName, { meetingId } payload, and startAfter 15 min before meeting', async () => {
      // Arrange
      mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
      mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
      mockPrisma.meeting.create.mockResolvedValue(MOCK_MEETING);
      mockLogActivity.mockResolvedValue(undefined);

      // Act
      await scheduleMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        title: 'Planning session',
        startTime: START_TIME,
        endTime: END_TIME,
      });
      // Flush microtasks so the fire-and-forget scheduleReminderComment resolves
      await new Promise<void>((resolve) => setImmediate(resolve));

      // Assert — boss.send called with correct args
      expect(mockBoss.send).toHaveBeenCalledWith(
        REMINDER_JOB_NAME,
        { meetingId: MEETING_ID },
        expect.objectContaining({ startAfter: expect.any(Date) }),
      );

      // The startAfter date should be 15 minutes before START_TIME
      const sendCall = (mockBoss.send as jest.Mock).mock.calls[0];
      const startAfter: Date = sendCall[2].startAfter;
      const expectedReminderTime = new Date(START_TIME.getTime() - 15 * 60 * 1000);
      expect(startAfter.getTime()).toBeCloseTo(expectedReminderTime.getTime(), -3);
    });

    it('does NOT call boss.send() when reminderTime is in the past (meeting starts in <15 min)', async () => {
      // Arrange — meeting starting very soon (2 min from now) so reminder time is already past
      const soonStart = new Date(Date.now() + 2 * 60 * 1000);
      const soonEnd = new Date(Date.now() + 32 * 60 * 1000);
      const soonMeeting = { ...MOCK_MEETING, startTime: soonStart, endTime: soonEnd };

      mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
      mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
      mockPrisma.meeting.create.mockResolvedValue(soonMeeting);
      mockLogActivity.mockResolvedValue(undefined);

      // Act
      await scheduleMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, {
        title: 'Imminent meeting',
        startTime: soonStart,
        endTime: soonEnd,
      });
      // Flush microtasks so the fire-and-forget scheduleReminderComment resolves
      await new Promise<void>((resolve) => setImmediate(resolve));

      // Assert — boss.send NOT called because reminder time has already passed
      expect(mockBoss.send).not.toHaveBeenCalled();
      // cancel may still be called to clean up any stale job
      expect(mockBoss.cancel).toHaveBeenCalled();
    });
  });

  // ─── updateMeeting + pg-boss ──────────────────────────────────────────────

  describe('updateMeeting with pg-boss', () => {
    it('fires cancel-then-send when startTime changes — boss.cancel before boss.send', async () => {
      // Arrange
      mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
      mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
      mockPrisma.meeting.findUnique.mockResolvedValue(MOCK_MEETING);
      const newStart = new Date('2027-02-01T14:00:00Z');
      const newEnd = new Date('2027-02-01T15:00:00Z');
      const updatedMeeting = { ...MOCK_MEETING, startTime: newStart, endTime: newEnd };
      mockPrisma.meeting.update.mockResolvedValue(updatedMeeting);
      mockUpdateCalendarEvent.mockResolvedValue(undefined);
      mockLogActivity.mockResolvedValue(undefined);

      // Act
      await updateMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID, {
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
      });
      // Flush microtasks so the fire-and-forget scheduleReminderComment resolves
      await new Promise<void>((resolve) => setImmediate(resolve));

      // Assert — cancel fired before send
      expect(mockBoss.cancel).toHaveBeenCalledWith(REMINDER_JOB_NAME);
      expect(mockBoss.send).toHaveBeenCalledWith(
        REMINDER_JOB_NAME,
        { meetingId: MEETING_ID },
        expect.objectContaining({ startAfter: expect.any(Date) }),
      );
      const cancelOrder = (mockBoss.cancel as jest.Mock).mock.invocationCallOrder[0];
      const sendOrder = (mockBoss.send as jest.Mock).mock.invocationCallOrder[0];
      expect(cancelOrder).toBeLessThan(sendOrder);
    });

    it('does NOT reschedule reminder when only title changes (no time change)', async () => {
      // Arrange
      mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
      mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
      mockPrisma.meeting.findUnique.mockResolvedValue(MOCK_MEETING);
      const updatedMeeting = { ...MOCK_MEETING, title: 'New title only' };
      mockPrisma.meeting.update.mockResolvedValue(updatedMeeting);
      mockUpdateCalendarEvent.mockResolvedValue(undefined);
      mockLogActivity.mockResolvedValue(undefined);

      // Act — only title, no time fields
      await updateMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID, {
        title: 'New title only',
      });

      // Assert — no reminder rescheduled
      expect(mockBoss.send).not.toHaveBeenCalled();
    });
  });

  // ─── cancelMeeting + pg-boss ──────────────────────────────────────────────

  describe('cancelMeeting with pg-boss', () => {
    it('calls boss.cancel() with the correct job name before deleting from DB', async () => {
      // Arrange
      mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
      mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
      mockPrisma.meeting.findUnique.mockResolvedValue(MOCK_MEETING);
      mockPrisma.meeting.delete.mockResolvedValue(MOCK_MEETING);
      mockLogActivity.mockResolvedValue(undefined);

      // Act
      await cancelMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID);

      // Assert — boss.cancel called with correct job name
      expect(mockBoss.cancel).toHaveBeenCalledWith(REMINDER_JOB_NAME);
    });

    it('still deletes meeting from DB even if boss.cancel() rejects', async () => {
      // Arrange
      mockPrisma.projectMember.findFirst.mockResolvedValue(MOCK_MEMBER_MEMBERSHIP);
      mockPrisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET_WITH_PROJECT);
      mockPrisma.meeting.findUnique.mockResolvedValue(MOCK_MEETING);
      mockPrisma.meeting.delete.mockResolvedValue(MOCK_MEETING);
      mockLogActivity.mockResolvedValue(undefined);
      // boss.cancel throws
      (mockBoss.cancel as jest.Mock).mockRejectedValueOnce(new Error('pg-boss cancel failed'));

      // Act — should not throw
      const result = await cancelMeeting(USER_ID, PROJECT_ID, TICKET_NUMBER, MEETING_ID);

      // Assert — DB deletion still happened
      expect(mockPrisma.meeting.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MEETING_ID } }),
      );
      expect(result).toMatchObject({ message: 'Meeting cancelled' });
    });
  });

  // ─── rehydrateMeetingReminders (pg-boss era) ───────────────────────────────

  describe('rehydrateMeetingReminders (pg-boss no-op)', () => {
    it('resolves immediately without touching the DB or boss', async () => {
      // Act
      await rehydrateMeetingReminders();

      // Assert — completely inert
      expect(mockPrisma.meeting.findMany).not.toHaveBeenCalled();
      expect(mockBoss.send).not.toHaveBeenCalled();
      expect(mockBoss.cancel).not.toHaveBeenCalled();
    });
  });

  // ─── registerReminderWorker ────────────────────────────────────────────────

  describe('registerReminderWorker', () => {
    it('calls boss.work() with a pattern containing "meeting-reminder"', async () => {
      // Act
      await registerReminderWorker();

      // Assert
      expect(mockBoss.work).toHaveBeenCalledTimes(1);
      const [pattern] = (mockBoss.work as jest.Mock).mock.calls[0];
      expect(typeof pattern).toBe('string');
      expect(pattern).toContain('meeting-reminder');
    });

    it('registers a handler function as the second argument to boss.work()', async () => {
      // Act
      await registerReminderWorker();

      // Assert — second arg is the worker callback
      const [, handler] = (mockBoss.work as jest.Mock).mock.calls[0];
      expect(typeof handler).toBe('function');
    });

    describe('worker callback', () => {
      let workerHandler: (job: { data: { meetingId: string } }) => Promise<void>;

      beforeEach(async () => {
        // Register the worker to capture the handler
        await registerReminderWorker();
        workerHandler = (mockBoss.work as jest.Mock).mock.calls[0][1];
      });

      it('returns without creating a comment when meeting is not found (already cancelled)', async () => {
        // Arrange
        mockPrisma.meeting.findUnique.mockResolvedValue(null);

        // Act — should not throw
        await expect(
          workerHandler({ data: { meetingId: MEETING_ID } }),
        ).resolves.toBeUndefined();

        // Assert — no comment created
        expect(mockPrisma.comment.create).not.toHaveBeenCalled();
      });

      it('creates a reminder comment and broadcasts when meeting exists', async () => {
        // Arrange
        const meetingWithTicketAndProject = {
          ...MOCK_MEETING,
          ticket: {
            id: TICKET_ID,
            projectId: PROJECT_ID,
            project: { id: PROJECT_ID },
          },
        };
        mockPrisma.meeting.findUnique.mockResolvedValue(meetingWithTicketAndProject);
        mockPrisma.comment.create.mockResolvedValue({
          id: 'reminder-comment-uuid',
          ticketId: TICKET_ID,
          authorId: USER_ID,
          body: 'Reminder: "Planning session" starts in 15 minutes.',
          createdAt: new Date(),
          updatedAt: new Date(),
          author: { id: USER_ID, displayName: 'Alice Smith', avatarUrl: null },
        });

        // Act
        await workerHandler({ data: { meetingId: MEETING_ID } });

        // Assert — comment created with meeting details
        expect(mockPrisma.comment.create).toHaveBeenCalledTimes(1);
        const createCall = mockPrisma.comment.create.mock.calls[0][0];
        expect(createCall.data.ticketId).toBe(TICKET_ID);
        expect(createCall.data.authorId).toBe(USER_ID);
        expect(createCall.data.body).toContain('15 minutes');

        // Assert — event broadcasted
        expect(mockBroadcast).toHaveBeenCalledWith(
          PROJECT_ID,
          'comment.created',
          expect.objectContaining({ comment: expect.anything() }),
        );
      });

      it('re-throws errors so pg-boss retries the job', async () => {
        // Arrange
        mockPrisma.meeting.findUnique.mockRejectedValueOnce(new Error('DB connection lost'));

        // Act & Assert — error must propagate for pg-boss to retry
        await expect(
          workerHandler({ data: { meetingId: MEETING_ID } }),
        ).rejects.toThrow('DB connection lost');
      });
    });
  });
});
