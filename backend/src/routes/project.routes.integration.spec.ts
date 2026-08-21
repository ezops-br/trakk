// Regression test for the removal of GET /api/v1/projects/archived.
//
// The sidebar's "Archived" section (and its backing route) has been removed,
// so GET /api/v1/projects/archived is no longer a distinct listing endpoint.
// It falls through to GET /:id, treating the literal string "archived" as a
// project id. The requesting user is not a member of a project with that id,
// so getProjectById's membership check throws 403 Forbidden — never a 200
// with a { projects: [...] } array.

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { forbidden } from '../lib/app-error';

jest.mock('../services/project.service', () => ({
  listProjectsByUser: jest.fn(),
  getProjectById: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  toggleArchiveProject: jest.fn(),
}));

jest.mock('../middleware/auth');

import { projectRouter } from './project.routes';
import * as projectService from '../services/project.service';
import * as authMiddleware from '../middleware/auth';

const mockGetProjectById = projectService.getProjectById as jest.MockedFunction<
  typeof projectService.getProjectById
>;
const mockRequireAuth = authMiddleware.requireAuth as jest.MockedFunction<
  typeof authMiddleware.requireAuth
>;

const FAKE_USER = { userId: 'user-uuid-1', email: 'alice@example.com' };
const VALID_SESSION = 'valid.session.token';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  mockRequireAuth.mockImplementation((req, _res, next) => {
    req.user = FAKE_USER;
    next();
  });

  app.use('/api/v1/projects', projectRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  // "archived" is treated as a literal project id by getProjectById, and the
  // caller is not a member, so the membership check rejects it.
  mockGetProjectById.mockRejectedValue(forbidden());
});

describe('GET /api/v1/projects/archived (removed)', () => {
  it('is no longer a distinct listing route — falls through to GET /:id and never returns a { projects } array', async () => {
    const app = buildApp();

    const res = await request(app)
      .get('/api/v1/projects/archived')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // This must behave exactly like GET /:id with id="archived": the caller
    // is not a member of a project literally named "archived", so
    // getProjectById's membership check throws 403 Forbidden.
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(res.body.projects).toBeUndefined();
    expect(mockGetProjectById).toHaveBeenCalledWith('archived', FAKE_USER.userId);
  });
});
