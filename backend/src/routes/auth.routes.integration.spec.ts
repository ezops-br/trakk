// TDD Red Phase — new auth endpoints do not exist yet.
// Tests for DELETE /api/v1/auth/me (CSRF mitigation).

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';

// Mock all service dependencies before importing the router
jest.mock('../services/auth.service');
jest.mock('../utils/jwt');

import { authRouter } from './auth.routes';
import * as authService from '../services/auth.service';
import * as jwtUtils from '../utils/jwt';

const mockDisconnectUser = authService.disconnectUser as jest.MockedFunction<typeof authService.disconnectUser>;
const mockVerifyToken = jwtUtils.verifyToken as jest.MockedFunction<typeof jwtUtils.verifyToken>;

const FAKE_TOKEN_PAYLOAD = { userId: 'user-uuid-1', email: 'alice@example.com' };
const VALID_SESSION = 'valid.session.token';

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/v1/auth', authRouter);
  app.use(errorHandler);
  return app;
}

function buildAuthenticatedApp() {
  const app = buildApp();
  return app;
}

describe('DELETE /api/v1/auth/me', () => {
  const app = buildAuthenticatedApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);
    mockDisconnectUser.mockResolvedValue(undefined);
  });

  it('returns 415 when Content-Type header is absent', async () => {
    // Arrange — no Content-Type header, authenticated

    // Act
    const res = await request(app)
      .delete('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send(''); // no content-type set by supertest

    // Assert — CSRF mitigation: must reject non-JSON requests
    expect(res.status).toBe(415);
  });

  it('returns 415 when Content-Type is application/x-www-form-urlencoded', async () => {
    // Arrange

    // Act
    const res = await request(app)
      .delete('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('confirm=true');

    // Assert
    expect(res.status).toBe(415);
  });

  it('returns 200, calls disconnectUser, and clears trakk_session cookie with Content-Type: application/json', async () => {
    // Arrange

    // Act
    const res = await request(app)
      .delete('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .set('Content-Type', 'application/json')
      .send('{}');

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Account deleted' });
    expect(mockDisconnectUser).toHaveBeenCalledWith(FAKE_TOKEN_PAYLOAD.userId);
    const setCookie = res.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    expect(
      cookies.some(
        (c: string) => c.includes('trakk_session=') && (c.includes('Max-Age=0') || c.includes('Expires=')),
      ),
    ).toBe(true);
  });

  it('returns 401 when unauthenticated (no session cookie)', async () => {
    // Arrange
    mockVerifyToken.mockImplementation(() => {
      throw new Error('No token');
    });

    // Act
    const res = await request(app)
      .delete('/api/v1/auth/me')
      .set('Content-Type', 'application/json')
      .send('{}');

    // Assert
    expect(res.status).toBe(401);
  });
});
