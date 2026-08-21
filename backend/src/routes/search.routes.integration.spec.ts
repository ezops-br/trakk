// @ts-nocheck
// TDD Red Phase — search.routes.ts does not exist yet.
// Tests for GET /api/v1/search.
// All route tests will fail with 404 (route not registered) or "Cannot find module"
// until the implementation is added.

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../lib/app-error';

// Mock search service before importing the router (virtual: router doesn't exist yet)
jest.mock('../services/search.service', () => ({
  search: jest.fn().mockResolvedValue({ tickets: [], projects: [] }),
}), { virtual: true });

// Mock auth middleware
jest.mock('../middleware/auth');

import { searchRouter } from './search.routes';
import * as searchService from '../services/search.service';
import * as authMiddleware from '../middleware/auth';

const mockSearch = searchService.search as jest.MockedFunction<typeof searchService.search>;
const mockRequireAuth = authMiddleware.requireAuth as jest.MockedFunction<typeof authMiddleware.requireAuth>;

const FAKE_USER = { userId: '11111111-1111-1111-1111-111111111111', email: 'alice@example.com' };
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

  app.use('/api/v1/search', searchRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch.mockResolvedValue({ tickets: [], projects: [] });
});

describe('GET /api/v1/search', () => {
  it('returns 200 with { tickets, projects } shape for valid auth and query', async () => {
    // Arrange
    const app = buildApp();
    const mockTicket = {
      id: '44444444-4444-4444-4444-444444444444',
      number: 5,
      title: 'Fix ticket bug',
      priority: 'HIGH',
      projectId: '22222222-2222-2222-2222-222222222222',
      projectKey: 'TRAKK',
      projectName: 'Trakk',
      statusColumnName: 'In Progress',
      assigneeName: null,
      assigneeAvatar: null,
      updatedAt: '2026-06-10T10:00:00.000Z',
    };
    mockSearch.mockResolvedValue({ tickets: [mockTicket], projects: [] });

    // Act
    const res = await request(app)
      .get('/api/v1/search?q=ticket&limit=5')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tickets');
    expect(res.body).toHaveProperty('projects');
    // No outer envelope wrapper — response is flat { tickets, projects }
    expect(Array.isArray(res.body.tickets)).toBe(true);
    expect(Array.isArray(res.body.projects)).toBe(true);
  });

  it('returns 401 for an unauthenticated request', async () => {
    // Arrange
    const app = buildApp(false);

    // Act
    const res = await request(app).get('/api/v1/search?q=ticket');

    // Assert
    expect(res.status).toBe(401);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns 400 when query param q is too short (1 char)', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .get('/api/v1/search?q=a')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns 400 when project filter is not a valid UUID', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .get('/api/v1/search?q=ticket&project=not-a-uuid')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns 400 when limit exceeds maximum allowed value (50)', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .get('/api/v1/search?q=ticket&limit=51')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
