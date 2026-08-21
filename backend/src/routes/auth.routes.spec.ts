import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../lib/app-error';

// Mock all service dependencies before importing the router
jest.mock('../services/auth.service');
jest.mock('../services/google-oauth.service');
jest.mock('../utils/jwt');

import { authRouter } from './auth.routes';
import * as authService from '../services/auth.service';
import * as googleOAuthService from '../services/google-oauth.service';
import * as jwtUtils from '../utils/jwt';

const mockUpsertUser = authService.upsertUser as jest.MockedFunction<typeof authService.upsertUser>;
const mockFindUserById = authService.findUserById as jest.MockedFunction<typeof authService.findUserById>;
const mockUpdateMe = authService.updateMe as jest.MockedFunction<typeof authService.updateMe>;
const mockDisconnectUser = authService.disconnectUser as jest.MockedFunction<typeof authService.disconnectUser>;
const mockGenerateAuthUrl = googleOAuthService.generateAuthUrl as jest.MockedFunction<typeof googleOAuthService.generateAuthUrl>;
const mockExchangeCodeForTokens = googleOAuthService.exchangeCodeForTokens as jest.MockedFunction<typeof googleOAuthService.exchangeCodeForTokens>;
const mockDecodeIdToken = googleOAuthService.decodeIdToken as jest.MockedFunction<typeof googleOAuthService.decodeIdToken>;
const mockVerifyState = googleOAuthService.verifyState as jest.MockedFunction<typeof googleOAuthService.verifyState>;
const mockSignAccessToken = jwtUtils.signAccessToken as jest.MockedFunction<typeof jwtUtils.signAccessToken>;
const mockVerifyToken = jwtUtils.verifyToken as jest.MockedFunction<typeof jwtUtils.verifyToken>;

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/v1/auth', authRouter);
  app.use(errorHandler);
  return app;
}

const FAKE_USER = {
  id: 'user-uuid-1',
  email: 'alice@example.com',
  displayName: 'Alice Smith',
  avatarUrl: 'https://example.com/avatar.jpg',
  themePreference: 'light',
  avatarStoragePath: null,
  googleAvatarUrl: null,
  googleConnected: true,
  googleEmail: 'alice@example.com',
};

const FAKE_TOKEN_PAYLOAD = {
  userId: 'user-uuid-1',
  email: 'alice@example.com',
};

const VALID_SESSION = 'valid.session.token';
const OAUTH_STATE = 'a'.repeat(64);
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth?state=' + OAUTH_STATE;

describe('GET /api/v1/auth/google', () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateAuthUrl.mockReturnValue({ url: GOOGLE_AUTH_URL, state: OAUTH_STATE });
  });

  it('redirects 302 to a Google OAuth URL', async () => {
    // Act
    const res = await request(app).get('/api/v1/auth/google');

    // Assert
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
  });

  it('sets the oauth_state cookie in the response', async () => {
    // Act
    const res = await request(app).get('/api/v1/auth/google');

    // Assert
    const setCookie = res.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    expect(cookies.some((c: string) => c.startsWith('oauth_state='))).toBe(true);
  });
});

describe('GET /api/v1/auth/google/callback — error cases', () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /login?error=access_denied when query.error is present', async () => {
    // Act
    const res = await request(app)
      .get('/api/v1/auth/google/callback')
      .query({ error: 'access_denied' });

    // Assert
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
    expect(res.headers.location).toContain('error=access_denied');
  });

  it('redirects to /login?error=state_mismatch when oauth_state cookie is absent', async () => {
    // Act
    const res = await request(app)
      .get('/api/v1/auth/google/callback')
      .query({ code: 'auth-code', state: OAUTH_STATE });

    // Assert
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=state_mismatch');
  });

  it('redirects to /login?error=state_mismatch when state values do not match', async () => {
    // Arrange
    mockVerifyState.mockReturnValue(false);

    // Act
    const res = await request(app)
      .get('/api/v1/auth/google/callback')
      .set('Cookie', `oauth_state=${OAUTH_STATE}`)
      .query({ code: 'auth-code', state: 'wrong-state' });

    // Assert
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=state_mismatch');
  });

  it('redirects to /login?error=auth_failed when exchangeCodeForTokens throws', async () => {
    // Arrange
    mockVerifyState.mockReturnValue(true);
    mockExchangeCodeForTokens.mockRejectedValue(new AppError(500, 'Internal server error'));

    // Act
    const res = await request(app)
      .get('/api/v1/auth/google/callback')
      .set('Cookie', `oauth_state=${OAUTH_STATE}`)
      .query({ code: 'auth-code', state: OAUTH_STATE });

    // Assert
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=auth_failed');
  });

  it('redirects to /login?error=account_conflict when upsertUser throws a 409 conflict', async () => {
    // Arrange
    mockVerifyState.mockReturnValue(true);
    const fakeTokens = {
      access_token: 'acc',
      id_token: 'idt',
      expiry_date: 9999,
    };
    mockExchangeCodeForTokens.mockResolvedValue(fakeTokens);
    mockDecodeIdToken.mockReturnValue({
      sub: 'google-sub',
      email: 'alice@example.com',
      name: 'Alice',
      picture: null,
    });
    mockUpsertUser.mockRejectedValue(new AppError(409, 'Email already in use'));

    // Act
    const res = await request(app)
      .get('/api/v1/auth/google/callback')
      .set('Cookie', `oauth_state=${OAUTH_STATE}`)
      .query({ code: 'auth-code', state: OAUTH_STATE });

    // Assert
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=account_conflict');
  });
});

describe('GET /api/v1/auth/google/callback — success', () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets the trakk_session cookie and redirects to /callback on a successful flow', async () => {
    // Arrange
    mockVerifyState.mockReturnValue(true);
    const fakeTokens = {
      access_token: 'acc',
      id_token: 'idt',
      expiry_date: 9999,
    };
    mockExchangeCodeForTokens.mockResolvedValue(fakeTokens);
    mockDecodeIdToken.mockReturnValue({
      sub: 'google-sub',
      email: 'alice@example.com',
      name: 'Alice',
      picture: 'https://example.com/pic.jpg',
    });
    mockUpsertUser.mockResolvedValue(FAKE_USER as Parameters<typeof mockUpsertUser.mockResolvedValue>[0]);
    mockSignAccessToken.mockReturnValue(VALID_SESSION);

    // Act
    const res = await request(app)
      .get('/api/v1/auth/google/callback')
      .set('Cookie', `oauth_state=${OAUTH_STATE}`)
      .query({ code: 'auth-code', state: OAUTH_STATE });

    // Assert
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/callback');
    const setCookie = res.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    expect(cookies.some((c: string) => c.startsWith('trakk_session='))).toBe(true);
  });
});

describe('GET /api/v1/auth/me', () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when no trakk_session cookie is present', async () => {
    // Arrange
    mockVerifyToken.mockImplementation(() => {
      throw new Error('No token');
    });

    // Act
    const res = await request(app).get('/api/v1/auth/me');

    // Assert
    expect(res.status).toBe(401);
  });

  it('returns { id, email, displayName, avatarUrl } when authenticated', async () => {
    // Arrange
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);
    mockFindUserById.mockResolvedValue(FAKE_USER);

    // Act
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: FAKE_USER.id,
      email: FAKE_USER.email,
      displayName: FAKE_USER.displayName,
      avatarUrl: FAKE_USER.avatarUrl,
    });
  });

  it('response body includes themePreference field', async () => {
    // Arrange
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);
    mockFindUserById.mockResolvedValue(FAKE_USER);

    // Act
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert — themePreference must be returned from findUserById and present in response
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('themePreference', 'light');
  });
});

describe('PATCH /api/v1/auth/me', () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    // Arrange
    mockVerifyToken.mockImplementation(() => {
      throw new Error('No token');
    });

    // Act
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .send({ displayName: 'New Name' });

    // Assert
    expect(res.status).toBe(401);
  });

  it('returns 400 when body is empty — no fields provided', async () => {
    // Arrange — patchMeSchema must use .refine() requiring at least one field
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);

    // Act
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({});

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when displayName is an empty string', async () => {
    // Arrange
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);

    // Act
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ displayName: '' });

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when displayName exceeds 100 characters', async () => {
    // Arrange
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);

    // Act
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ displayName: 'a'.repeat(101) });

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 400 when themePreference is an invalid value', async () => {
    // Arrange — "blue" is not in the enum ["light", "dark"]
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);

    // Act
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ themePreference: 'blue' });

    // Assert
    expect(res.status).toBe(400);
  });

  it('returns 200 with themePreference "dark" when { themePreference: "dark" } is sent', async () => {
    // Arrange
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);
    const updatedUser = { ...FAKE_USER, themePreference: 'dark' };
    mockUpdateMe.mockResolvedValue(updatedUser);

    // Act
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ themePreference: 'dark' });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.themePreference).toBe('dark');
  });

  it('returns 200 when both displayName and themePreference are sent', async () => {
    // Arrange
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);
    const updatedUser = { ...FAKE_USER, displayName: 'Updated Name', themePreference: 'dark' };
    mockUpdateMe.mockResolvedValue(updatedUser);

    // Act
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ displayName: 'Updated Name', themePreference: 'dark' });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Updated Name');
    expect(res.body.themePreference).toBe('dark');
  });

  it('returns the updated user profile when displayName is valid (legacy path via updateMe)', async () => {
    // Arrange
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);
    const updatedUser = { ...FAKE_USER, displayName: 'New Name' };
    mockUpdateMe.mockResolvedValue(updatedUser);

    // Act
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ displayName: 'New Name' });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('New Name');
  });
});

describe('POST /api/v1/auth/logout', () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    // Arrange
    mockVerifyToken.mockImplementation(() => {
      throw new Error('No token');
    });

    // Act
    const res = await request(app).post('/api/v1/auth/logout');

    // Assert
    expect(res.status).toBe(401);
  });

  it('clears the trakk_session cookie and returns 200 { message: "Logged out" }', async () => {
    // Arrange
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);

    // Act
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out');
    const setCookie = res.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    // Cookie cleared when its value is empty or Max-Age=0
    expect(
      cookies.some(
        (c: string) => c.includes('trakk_session=') && (c.includes('Max-Age=0') || c.includes('Expires=')),
      ),
    ).toBe(true);
  });
});

describe('POST /api/v1/auth/disconnect', () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    // Arrange
    mockVerifyToken.mockImplementation(() => {
      throw new Error('No token');
    });

    // Act
    const res = await request(app).post('/api/v1/auth/disconnect');

    // Assert
    expect(res.status).toBe(401);
  });

  it('calls disconnectUser, clears the trakk_session cookie, and returns 200', async () => {
    // Arrange
    mockVerifyToken.mockReturnValue(FAKE_TOKEN_PAYLOAD);
    mockDisconnectUser.mockResolvedValue(undefined);

    // Act
    const res = await request(app)
      .post('/api/v1/auth/disconnect')
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(mockDisconnectUser).toHaveBeenCalledWith(FAKE_TOKEN_PAYLOAD.userId);
    const setCookie = res.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    expect(
      cookies.some(
        (c: string) => c.includes('trakk_session=') && (c.includes('Max-Age=0') || c.includes('Expires=')),
      ),
    ).toBe(true);
  });
});
