// @ts-nocheck
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';

jest.mock('../middleware/auth');

jest.mock('../services/project.service', () => ({
  listProjectsByUser: jest.fn(),
  getProjectById: jest.fn(),
  createProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  toggleArchiveProject: jest.fn(),
}));

import { projectRouter } from './project.routes';
import * as projectService from '../services/project.service';
import * as authMiddleware from '../middleware/auth';

const mockCreateProject = projectService.createProject as jest.MockedFunction<typeof projectService.createProject>;
const mockUpdateProject = projectService.updateProject as jest.MockedFunction<typeof projectService.updateProject>;
const mockRequireAuth = authMiddleware.requireAuth as jest.MockedFunction<typeof authMiddleware.requireAuth>;

const FAKE_USER = { userId: '550e8400-e29b-4d41-a716-446655440001', email: 'alice@example.com' };
const PROJECT_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';
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
});

// ─── project.schemas — dueDate validation ─────────────────────────────────────

describe('project.schemas — dueDate validation', () => {
  it('rejects a non-date string for dueDate on POST /projects', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({
        name: 'Trakk',
        key: 'TRAKK',
        dueDate: 'not-a-date',
      });

    expect(res.status).toBe(400);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('rejects a non-date string for dueDate on PATCH /projects/:id', async () => {
    const app = buildApp();

    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ dueDate: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });
});
