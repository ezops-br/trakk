// @ts-nocheck
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../lib/app-error';

// Mock all service dependencies before importing the router.
// Use virtual: true for the service that does not exist yet so Jest creates a
// virtual module and the test suite can load without the implementation.
jest.mock('../services/member.service', () => ({
  listMembers: jest.fn(),
  inviteMember: jest.fn(),
  changeMemberRole: jest.fn(),
  removeMember: jest.fn(),
}), { virtual: true });
jest.mock('../middleware/auth');

import { memberRouter } from './member.routes';
import * as memberService from '../services/member.service';
import * as authMiddleware from '../middleware/auth';

const mockListMembers = memberService.listMembers as jest.MockedFunction<typeof memberService.listMembers>;
const mockInviteMember = memberService.inviteMember as jest.MockedFunction<typeof memberService.inviteMember>;
const mockChangeMemberRole = memberService.changeMemberRole as jest.MockedFunction<typeof memberService.changeMemberRole>;
const mockRemoveMember = memberService.removeMember as jest.MockedFunction<typeof memberService.removeMember>;
const mockRequireAuth = authMiddleware.requireAuth as jest.MockedFunction<typeof authMiddleware.requireAuth>;

const FAKE_USER = { userId: 'user-uuid-1', email: 'alice@example.com' };
const PROJECT_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';
const MEMBER_ID = 'b1c2d3e4-f5a6-789b-cdef-012345678901';
const VALID_SESSION = 'valid.session.token';

const MOCK_MEMBER = {
  id: MEMBER_ID,
  projectId: PROJECT_ID,
  userId: FAKE_USER.userId,
  role: 'MEMBER' as const,
  joinedAt: new Date('2024-01-01').toISOString(),
  user: {
    id: FAKE_USER.userId,
    email: FAKE_USER.email,
    displayName: 'Alice Smith',
    avatarUrl: null,
    themePreference: 'light',
    createdAt: new Date('2024-01-01').toISOString(),
    updatedAt: new Date('2024-01-01').toISOString(),
  },
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

  app.use('/api/v1/projects', memberRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── GET /:projectId/members ──────────────────────────────────────────────────

describe('GET /api/v1/projects/:projectId/members', () => {
  it('returns 200 with members list on happy path', async () => {
    // Arrange
    const app = buildApp();
    mockListMembers.mockResolvedValue([MOCK_MEMBER] as any);

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/members`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('members');
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0]).toMatchObject({ id: MEMBER_ID });
    expect(mockListMembers).toHaveBeenCalledWith(FAKE_USER.userId, PROJECT_ID);
  });

  it('returns 401 when no auth cookie is present', async () => {
    // Arrange
    const app = buildApp(false);

    // Act
    const res = await request(app).get(`/api/v1/projects/${PROJECT_ID}/members`);

    // Assert
    expect(res.status).toBe(401);
  });

  it('returns 400 when projectId is not a valid UUID', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .get('/api/v1/projects/not-a-uuid/members')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(400);
  });
});

// ─── POST /:projectId/members ─────────────────────────────────────────────────

describe('POST /api/v1/projects/:projectId/members', () => {
  it('returns 201 with new member on happy path', async () => {
    // Arrange
    const app = buildApp();
    mockInviteMember.mockResolvedValue(MOCK_MEMBER as any);

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/members`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ email: 'bob@example.com', role: 'MEMBER' });

    // Assert
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('member');
    expect(mockInviteMember).toHaveBeenCalledWith(
      FAKE_USER.userId,
      PROJECT_ID,
      'bob@example.com',
      'MEMBER',
    );
  });

  it('returns 400 when email is invalid', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/members`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ email: 'not-an-email', role: 'MEMBER' });

    // Assert
    expect(res.status).toBe(400);
    expect(mockInviteMember).not.toHaveBeenCalled();
  });

  it('returns 400 when role is OWNER (only MEMBER or VIEWER can be invited)', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/members`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ email: 'bob@example.com', role: 'OWNER' });

    // Assert
    expect(res.status).toBe(400);
    expect(mockInviteMember).not.toHaveBeenCalled();
  });

  it('propagates 404 when email not found in system', async () => {
    // Arrange
    const app = buildApp();
    mockInviteMember.mockRejectedValue(
      new AppError(404, 'No Trakk account found for this email. They must sign in with Google first.'),
    );

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/members`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ email: 'unknown@example.com', role: 'MEMBER' });

    // Assert
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('No Trakk account');
  });

  it('propagates 409 when user is already a member', async () => {
    // Arrange
    const app = buildApp();
    mockInviteMember.mockRejectedValue(
      new AppError(409, 'User is already a member of this project'),
    );

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/members`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ email: 'bob@example.com', role: 'MEMBER' });

    // Assert
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('User is already a member of this project');
  });
});

// ─── PATCH /:projectId/members/:memberId ──────────────────────────────────────

describe('PATCH /api/v1/projects/:projectId/members/:memberId', () => {
  it('returns 200 with updated member on happy path', async () => {
    // Arrange
    const app = buildApp();
    const updatedMember = { ...MOCK_MEMBER, role: 'OWNER' as const };
    mockChangeMemberRole.mockResolvedValue(updatedMember as any);

    // Act
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/members/${MEMBER_ID}`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ role: 'OWNER' });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('member');
    expect(res.body.member.role).toBe('OWNER');
    expect(mockChangeMemberRole).toHaveBeenCalledWith(
      FAKE_USER.userId,
      PROJECT_ID,
      MEMBER_ID,
      'OWNER',
    );
  });

  it('returns 400 when role value is invalid', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/members/${MEMBER_ID}`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ role: 'SUPERADMIN' });

    // Assert
    expect(res.status).toBe(400);
    expect(mockChangeMemberRole).not.toHaveBeenCalled();
  });

  it('propagates 403 when service throws forbidden', async () => {
    // Arrange
    const app = buildApp();
    mockChangeMemberRole.mockRejectedValue(new AppError(403, 'Forbidden'));

    // Act
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/members/${MEMBER_ID}`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ role: 'MEMBER' });

    // Assert
    expect(res.status).toBe(403);
  });
});

// ─── DELETE /:projectId/members/:memberId ─────────────────────────────────────

describe('DELETE /api/v1/projects/:projectId/members/:memberId', () => {
  it('returns 204 on successful removal', async () => {
    // Arrange
    const app = buildApp();
    mockRemoveMember.mockResolvedValue(undefined as any);

    // Act
    const res = await request(app)
      .delete(`/api/v1/projects/${PROJECT_ID}/members/${MEMBER_ID}`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(204);
    expect(mockRemoveMember).toHaveBeenCalledWith(FAKE_USER.userId, PROJECT_ID, MEMBER_ID);
  });

  it('returns 401 when no auth cookie is present', async () => {
    // Arrange
    const app = buildApp(false);

    // Act
    const res = await request(app).delete(`/api/v1/projects/${PROJECT_ID}/members/${MEMBER_ID}`);

    // Assert
    expect(res.status).toBe(401);
  });

  it('propagates 400 when service throws last-owner error', async () => {
    // Arrange
    const app = buildApp();
    mockRemoveMember.mockRejectedValue(
      new AppError(400, 'Cannot remove the last owner. Promote another member to Owner first.'),
    );

    // Act
    const res = await request(app)
      .delete(`/api/v1/projects/${PROJECT_ID}/members/${MEMBER_ID}`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot remove the last owner');
  });
});
