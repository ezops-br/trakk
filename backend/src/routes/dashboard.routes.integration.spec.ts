// @ts-nocheck
// TDD Red Phase — dashboard.routes.ts does not exist yet.
// Tests for GET /api/v1/dashboard and GET /api/v1/dashboard/events.
// All route tests will fail with 404 (route not registered) until implementation.
// Service-layer tests will fail with "Cannot find module" until service is added.

import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../lib/app-error';

// Mock dashboard service before importing the router (virtual: router doesn't exist yet)
jest.mock('../services/dashboard.service', () => ({
  getDashboardData: jest.fn().mockResolvedValue({
    tickets: [],
    activities: [],
    projects: [],
  }),
}), { virtual: true });

// Mock auth middleware
jest.mock('../middleware/auth');

import { dashboardRouter } from './dashboard.routes';
import * as dashboardService from '../services/dashboard.service';
import * as authMiddleware from '../middleware/auth';

const mockGetDashboardData = dashboardService.getDashboardData as jest.MockedFunction<
  typeof dashboardService.getDashboardData
>;
const mockRequireAuth = authMiddleware.requireAuth as jest.MockedFunction<
  typeof authMiddleware.requireAuth
>;

const FAKE_USER = { userId: 'user-uuid-1', email: 'alice@example.com' };
const VALID_SESSION = 'valid.session.token';

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

  app.use('/api/v1/dashboard', dashboardRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-apply the default resolved value after clearAllMocks wipes implementations
  mockGetDashboardData.mockResolvedValue({
    tickets: [],
    activities: [],
    projects: [],
  });
});

describe('GET /api/v1/dashboard', () => {
  it('returns 200 with wrapped dashboard data for an authenticated user', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tickets');
    expect(res.body).toHaveProperty('activities');
    expect(res.body).toHaveProperty('projects');
    expect(Array.isArray(res.body.tickets)).toBe(true);
    expect(Array.isArray(res.body.activities)).toBe(true);
    expect(Array.isArray(res.body.projects)).toBe(true);
  });

  it('returns 401 for an unauthenticated request (no cookie)', async () => {
    // Arrange
    const app = buildApp(false);

    // Act
    const res = await request(app).get('/api/v1/dashboard');

    // Assert
    expect(res.status).toBe(401);
    expect(mockGetDashboardData).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/dashboard/events', () => {
  it('returns 200 with text/event-stream content-type for an authenticated user', async () => {
    // Arrange
    const app = buildApp();
    // Supertest with buffer(false) does not resolve via .timeout() for SSE streams
    // because flushHeaders() sends the response start immediately, satisfying the
    // response timeout, but the stream body never ends. Use http.Server directly
    // and destroy the socket after reading the headers.
    const server = http.createServer(app);

    const { status, contentType } = await new Promise<{ status: number; contentType: string }>((resolve, reject) => {
      server.listen(0, () => {
        const port = (server.address() as { port: number }).port;
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: '/api/v1/dashboard/events',
            method: 'GET',
            headers: { Cookie: `trakk_session=${VALID_SESSION}` },
          },
          (res) => {
            resolve({
              status: res.statusCode ?? 0,
              contentType: res.headers['content-type'] ?? '',
            });
            // Immediately destroy the socket so the server-side 'close' event fires
            // and the route's keepAlive interval is cleared.
            res.destroy();
          },
        );
        req.on('error', reject);
        req.end();
      });
    });

    server.close();

    // Assert — SSE endpoint must send the event-stream content-type header
    expect(status).toBe(200);
    expect(contentType).toMatch(/text\/event-stream/);
  });

  it('returns 401 for an unauthenticated request on the events endpoint', async () => {
    // Arrange
    const app = buildApp(false);

    // Act
    const res = await request(app).get('/api/v1/dashboard/events');

    // Assert
    expect(res.status).toBe(401);
  });
});
