// @ts-nocheck
// Integration tests for GET /api/v1/calendar/events.

jest.mock('../services/google-calendar.service', () => ({
  createCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
  getUpcomingEvents: jest.fn(),
}));

jest.mock('../services/google-oauth.service', () => ({
  getRefreshedAccessToken: jest.fn(),
}));

jest.mock('../lib/prisma', () => ({
  prisma: {
    oAuthAccount: { findFirst: jest.fn() },
  },
}));

jest.mock('../middleware/auth');

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../lib/app-error';

import { calendarRouter } from './calendar.routes';
import * as calendarService from '../services/google-calendar.service';
import * as oauthService from '../services/google-oauth.service';
import * as authMiddleware from '../middleware/auth';
import { prisma } from '../lib/prisma';

const mockGetUpcomingEvents = calendarService.getUpcomingEvents as jest.MockedFunction<typeof calendarService.getUpcomingEvents>;
const mockGetRefreshedAccessToken = oauthService.getRefreshedAccessToken as jest.MockedFunction<typeof oauthService.getRefreshedAccessToken>;
const mockRequireAuth = authMiddleware.requireAuth as jest.MockedFunction<typeof authMiddleware.requireAuth>;
const mockPrisma = prisma as any;

const FAKE_USER = { userId: '550e8400-e29b-4d41-a716-446655440001', email: 'alice@example.com' };
const VALID_SESSION = 'valid.session.token';
const URL = '/api/v1/calendar/events';

const MOCK_ACCOUNT = { userId: FAKE_USER.userId, provider: 'google', refreshTokenEnc: 'enc-token' };
const MOCK_EVENTS = [{ id: 'ev-1', summary: 'Standup', start: '2026-06-12T09:00:00Z', end: '2026-06-12T09:30:00Z',
  description: null, meetLink: null, htmlLink: '', isTrakkEvent: false, trakkTicketId: null }];

function buildApp(authenticated = true) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  if (authenticated) {
    mockRequireAuth.mockImplementation((req, _res, next) => { req.user = FAKE_USER; next(); });
  } else {
    mockRequireAuth.mockImplementation((_req, _res, next) => { next(new AppError(401, 'Unauthorized')); });
  }
  app.use('/api/v1/calendar', calendarRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRefreshedAccessToken.mockResolvedValue('fresh-token');
  mockPrisma.oAuthAccount.findFirst.mockResolvedValue(MOCK_ACCOUNT);
  mockGetUpcomingEvents.mockResolvedValue(MOCK_EVENTS as any);
});

describe('GET /api/v1/calendar/events', () => {
  it('401 when unauthenticated', async () => {
    const res = await request(buildApp(false)).get(URL);
    expect(res.status).toBe(401);
    expect(mockGetUpcomingEvents).not.toHaveBeenCalled();
  });

  it('200 with events and calendarConnected=true on happy path; passes date+maxResults to service', async () => {
    const res = await request(buildApp())
      .get(`${URL}?date=2026-06-15&maxResults=5`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);
    expect(res.status).toBe(200);
    expect(res.body.calendarConnected).toBe(true);
    expect(res.body.events).toHaveLength(1);
    expect(mockGetUpcomingEvents).toHaveBeenCalledWith(
      'fresh-token',
      expect.objectContaining({ date: '2026-06-15', maxResults: 5 }),
    );
  });

  it('200 events=[], calendarConnected=false when no OAuthAccount', async () => {
    mockPrisma.oAuthAccount.findFirst.mockResolvedValue(null);
    const res = await request(buildApp())
      .get(URL).set('Cookie', `trakk_session=${VALID_SESSION}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ events: [], calendarConnected: false });
    expect(mockGetUpcomingEvents).not.toHaveBeenCalled();
  });

  it('200 needsReauth=true on invalid_grant; 200 error field on other refresh failure', async () => {
    const app = buildApp();
    mockGetRefreshedAccessToken.mockRejectedValue(new Error('invalid_grant'));
    const r1 = await request(app).get(URL).set('Cookie', `trakk_session=${VALID_SESSION}`);
    expect(r1.body).toMatchObject({ events: [], calendarConnected: false, needsReauth: true });

    mockGetRefreshedAccessToken.mockRejectedValue(new Error('timeout'));
    const r2 = await request(app).get(URL).set('Cookie', `trakk_session=${VALID_SESSION}`);
    expect(r2.body).toMatchObject({ events: [], calendarConnected: true, error: 'Calendar temporarily unavailable' });
  });

  it('200 error field when getUpcomingEvents throws', async () => {
    mockGetUpcomingEvents.mockRejectedValue(new Error('API error'));
    const res = await request(buildApp()).get(URL).set('Cookie', `trakk_session=${VALID_SESSION}`);
    expect(res.status).toBe(200);
    expect(res.body.error).toBe('Calendar temporarily unavailable');
  });

  it('400 on invalid date format; 400 on maxResults out of range; 200 on no params', async () => {
    const app = buildApp();
    const cookie = `trakk_session=${VALID_SESSION}`;
    expect((await request(app).get(`${URL}?date=not-a-date`).set('Cookie', cookie)).status).toBe(400);
    expect((await request(app).get(`${URL}?maxResults=51`).set('Cookie', cookie)).status).toBe(400);
    expect((await request(app).get(URL).set('Cookie', cookie)).status).toBe(200);
  });
});
