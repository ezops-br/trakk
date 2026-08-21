// @ts-nocheck
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../lib/app-error';

jest.mock('../lib/job-queue', () => ({
  boss: {
    send: jest.fn().mockResolvedValue('job-id'),
    cancel: jest.fn().mockResolvedValue(undefined),
    work: jest.fn().mockResolvedValue('worker-id'),
  },
  startJobQueue: jest.fn().mockResolvedValue(undefined),
}));

// Mock the meeting service and auth middleware.
jest.mock('../services/meeting.service', () => ({
  listMeetings: jest.fn(),
  scheduleMeeting: jest.fn(),
  updateMeeting: jest.fn(),
  cancelMeeting: jest.fn(),
  startInstantMeeting: jest.fn(),
  rehydrateMeetingReminders: jest.fn(),
}));

jest.mock('../middleware/auth');

import { meetingRouter } from './meeting.routes';
import * as meetingService from '../services/meeting.service';
import * as authMiddleware from '../middleware/auth';

const mockScheduleMeeting = meetingService.scheduleMeeting as jest.MockedFunction<typeof meetingService.scheduleMeeting>;
const mockListMeetings = meetingService.listMeetings as jest.MockedFunction<typeof meetingService.listMeetings>;
const mockUpdateMeeting = meetingService.updateMeeting as jest.MockedFunction<typeof meetingService.updateMeeting>;
const mockCancelMeeting = meetingService.cancelMeeting as jest.MockedFunction<typeof meetingService.cancelMeeting>;
const mockStartInstantMeeting = meetingService.startInstantMeeting as jest.MockedFunction<typeof meetingService.startInstantMeeting>;
const mockRequireAuth = authMiddleware.requireAuth as jest.MockedFunction<typeof authMiddleware.requireAuth>;

const FAKE_USER = { userId: '550e8400-e29b-4d41-a716-446655440001', email: 'alice@example.com' };
const PROJECT_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';
const TICKET_NUMBER = 5;
const MEETING_ID = 'b1c2d3e4-f5a6-789b-cdef-012345678901';
const VALID_SESSION = 'valid.session.token';

const MEETINGS_BASE = `/api/v1/projects/${PROJECT_ID}/tickets/${TICKET_NUMBER}/meetings`;

const MOCK_MEETING = {
  id: MEETING_ID,
  ticketId: 'ticket-uuid-1',
  organizerId: FAKE_USER.userId,
  googleEventId: 'google-event-id-1',
  meetLink: 'https://meet.google.com/abc-defg-hij',
  title: 'Planning session',
  startTime: '2026-06-12T14:00:00.000Z',
  endTime: '2026-06-12T15:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function buildApp(authenticated = true) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  if (authenticated) {
    mockRequireAuth.mockImplementation((req, _res, next) => {
      req.user = FAKE_USER;
      next();
    });
  } else {
    mockRequireAuth.mockImplementation((_req, _res, next) => {
      next(new AppError(401, 'Unauthorized'));
    });
  }

  app.use('/api/v1/projects', meetingRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── POST /...meetings ─────────────────────────────────────────────────────────

describe('POST /api/v1/projects/:projectId/tickets/:ticketNumber/meetings', () => {
  it('returns 201 with the created meeting wrapped in a { meeting } envelope', async () => {
    // Arrange
    const app = buildApp();
    mockScheduleMeeting.mockResolvedValue({ meeting: MOCK_MEETING } as any);

    // Act
    const res = await request(app)
      .post(MEETINGS_BASE)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({
        title: 'Planning session',
        startTime: '2026-06-12T14:00:00.000Z',
        endTime: '2026-06-12T15:00:00.000Z',
      });

    // Assert
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('meeting');
    expect(res.body.meeting).toMatchObject({ id: MEETING_ID });
  });

  it('returns 401 when no auth cookie is present', async () => {
    // Arrange
    const app = buildApp(false);

    // Act
    const res = await request(app)
      .post(MEETINGS_BASE)
      .send({
        title: 'Planning session',
        startTime: '2026-06-12T14:00:00.000Z',
        endTime: '2026-06-12T15:00:00.000Z',
      });

    // Assert
    expect(res.status).toBe(401);
    expect(mockScheduleMeeting).not.toHaveBeenCalled();
  });

  it('returns 403 when service throws forbidden (Viewer role)', async () => {
    // Arrange
    const app = buildApp();
    mockScheduleMeeting.mockRejectedValue(new AppError(403, 'Forbidden'));

    // Act
    const res = await request(app)
      .post(MEETINGS_BASE)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({
        title: 'Planning session',
        startTime: '2026-06-12T14:00:00.000Z',
        endTime: '2026-06-12T15:00:00.000Z',
      });

    // Assert
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing (Zod validation)', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .post(MEETINGS_BASE)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({
        startTime: '2026-06-12T14:00:00.000Z',
        endTime: '2026-06-12T15:00:00.000Z',
      });

    // Assert
    expect(res.status).toBe(400);
    expect(mockScheduleMeeting).not.toHaveBeenCalled();
  });
});

// ─── GET /...meetings ──────────────────────────────────────────────────────────

describe('GET /api/v1/projects/:projectId/tickets/:ticketNumber/meetings', () => {
  it('returns 200 with { meetings: [], nextCursor: null }', async () => {
    // Arrange
    const app = buildApp();
    mockListMeetings.mockResolvedValue({ meetings: [], nextCursor: null } as any);

    // Act
    const res = await request(app)
      .get(MEETINGS_BASE)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ meetings: [], nextCursor: null });
  });
});

// ─── PATCH /...meetings/:meetingId ─────────────────────────────────────────────

describe('PATCH /api/v1/projects/:projectId/tickets/:ticketNumber/meetings/:meetingId', () => {
  it('returns 200 with updated meeting', async () => {
    // Arrange
    const app = buildApp();
    const updatedMeeting = { ...MOCK_MEETING, title: 'Updated title' };
    mockUpdateMeeting.mockResolvedValue({ meeting: updatedMeeting } as any);

    // Act
    const res = await request(app)
      .patch(`${MEETINGS_BASE}/${MEETING_ID}`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ title: 'Updated title' });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('meeting');
    expect(res.body.meeting).toMatchObject({ title: 'Updated title' });
  });
});

// ─── DELETE /...meetings/:meetingId ────────────────────────────────────────────

describe('DELETE /api/v1/projects/:projectId/tickets/:ticketNumber/meetings/:meetingId', () => {
  it('returns 200 with { message: "Meeting cancelled" }', async () => {
    // Arrange
    const app = buildApp();
    mockCancelMeeting.mockResolvedValue({ message: 'Meeting cancelled' } as any);

    // Act
    const res = await request(app)
      .delete(`${MEETINGS_BASE}/${MEETING_ID}`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Meeting cancelled' });
  });
});

// ─── POST /...meetings/instant ─────────────────────────────────────────────────

describe('POST /api/v1/projects/:projectId/tickets/:ticketNumber/meetings/instant', () => {
  it('returns 201 and calls startInstantMeeting — /instant not matched by /:meetingId', async () => {
    // Arrange
    const app = buildApp();
    const instantMeeting = { ...MOCK_MEETING, title: 'Quick Meet — TST-5' };
    mockStartInstantMeeting.mockResolvedValue({ meeting: instantMeeting } as any);

    // Act
    const res = await request(app)
      .post(`${MEETINGS_BASE}/instant`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(201);
    expect(mockStartInstantMeeting).toHaveBeenCalledTimes(1);
    // Confirm cancelMeeting was NOT called (route ordering is correct)
    expect(mockCancelMeeting).not.toHaveBeenCalled();
    expect(res.body).toHaveProperty('meeting');
  });
});
