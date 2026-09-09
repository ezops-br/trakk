import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../lib/app-error';

// Mock all service dependencies before importing the router
jest.mock('../services/auth.service');
jest.mock('../utils/jwt');

import { authRouter } from './auth.routes';
import * as authService from '../services/auth.service';
import * as jwtUtils from '../utils/jwt';

const mockVerifyCredentials = authService.verifyCredentials as jest.MockedFunction<typeof authService.verifyCredentials>;
const mockFindUserById = authService.findUserById as jest.MockedFunction<typeof authService.findUserById>;
const mockUpdateMe = authService.updateMe as jest.MockedFunction<typeof authService.updateMe>;
const mockDisconnectUser = authService.disconnectUser as jest.MockedFunction<typeof authService.disconnectUser>;
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
};

const FAKE_TOKEN_PAYLOAD = {
  userId: 'user-uuid-1',
  email: 'alice@example.com',
};

const VALID_SESSION = 'valid.session.token';

describe('POST /api/v1/auth/login', () => {
  const app = buildApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200, the user JSON body, and sets the trakk_session cookie on valid credentials', async () => {
    // Arrange
    mockVerifyCredentials.mockResolvedValue(FAKE_USER);
    mockSignAccessToken.mockReturnValue(VALID_SESSION);

    // Act
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'correct-password' });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: FAKE_USER.id,
      email: FAKE_USER.email,
      displayName: FAKE_USER.displayName,
      avatarUrl: FAKE_USER.avatarUrl,
      themePreference: FAKE_USER.themePreference,
    });
    expect(mockVerifyCredentials).toHaveBeenCalledWith('alice@example.com', 'correct-password');
    const setCookie = res.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    expect(cookies.some((c: string) => c.startsWith('trakk_session='))).toBe(true);
  });

  it('returns 401 with the error body when credentials are invalid', async () => {
    // Arrange
    mockVerifyCredentials.mockRejectedValue(new AppError(401, 'Invalid email or password'));

    // Act
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com', password: 'wrong-password' });

    // Assert
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid email or password' });
    const setCookie = res.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
    expect(cookies.some((c: string) => c.startsWith('trakk_session='))).toBe(false);
  });

  it('returns 400 when email is missing', async () => {
    // Act
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'some-password' });

    // Assert
    expect(res.status).toBe(400);
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it('returns 400 when email is not a valid email format', async () => {
    // Act
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'some-password' });

    // Assert
    expect(res.status).toBe(400);
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
  });

  it('returns 400 when password is missing', async () => {
    // Act
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@example.com' });

    // Assert
    expect(res.status).toBe(400);
    expect(mockVerifyCredentials).not.toHaveBeenCalled();
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
