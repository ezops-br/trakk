import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { requireAuth, optionalAuth } from './auth';
import { signAccessToken } from '../utils/jwt';
import { errorHandler } from './error-handler';

function buildApp(useOptional = false) {
  const app = express();
  app.use(cookieParser());
  const middleware = useOptional ? optionalAuth : requireAuth;
  app.get('/test', middleware, (req, res) => {
    res.json({ user: req.user });
  });
  app.use(errorHandler);
  return app;
}

const validToken = () =>
  signAccessToken({ userId: 'user-abc', email: 'alice@test.com' });

describe('requireAuth', () => {
  const app = buildApp();

  it('returns 401 when no cookie is present', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('returns 401 when the token is invalid', async () => {
    const res = await request(app)
      .get('/test')
      .set('Cookie', 'trakk_session=bad.token.value');
    expect(res.status).toBe(401);
  });

  it('passes through and attaches user when token is valid', async () => {
    const token = validToken();
    const res = await request(app)
      .get('/test')
      .set('Cookie', `trakk_session=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe('user-abc');
    expect(res.body.user.email).toBe('alice@test.com');
  });
});

describe('optionalAuth', () => {
  const app = buildApp(true);

  it('sets req.user to null when no cookie is present', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it('sets req.user to null when the token is invalid', async () => {
    const res = await request(app)
      .get('/test')
      .set('Cookie', 'trakk_session=garbage');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it('attaches user when token is valid', async () => {
    const token = validToken();
    const res = await request(app)
      .get('/test')
      .set('Cookie', `trakk_session=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe('user-abc');
  });
});
