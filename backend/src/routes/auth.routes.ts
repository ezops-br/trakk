import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { authRateLimit } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import {
  generateAuthUrl,
  exchangeCodeForTokens,
  decodeIdToken,
  verifyState,
} from '../services/google-oauth.service';
import {
  upsertUser,
  findUserById,
  updateMe,
  disconnectUser,
  uploadAvatar,
  deleteAvatar,
  softDisconnectGoogle,
} from '../services/auth.service';
import { signAccessToken } from '../utils/jwt';
import { AppError } from '../lib/app-error';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const patchMeSchema = z
  .object({
    displayName:     z.string().min(1).max(100).optional(),
    themePreference: z.enum(["light", "dark"]).optional(),
  })
  .refine(
    (data) => data.displayName !== undefined || data.themePreference !== undefined,
    { message: "At least one field (displayName or themePreference) must be provided" },
  );

export const authRouter = Router();

// GET /google — initiate OAuth flow
authRouter.get('/google', authRateLimit, (req, res) => {
  const { url, state } = generateAuthUrl();
  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(url);
});

// GET /google/callback — handle OAuth callback
authRouter.get('/google/callback', authRateLimit, async (req, res) => {
  if (req.query.error) {
    res.clearCookie('oauth_state');
    res.redirect(`${config.CORS_ORIGIN}/login?error=access_denied`);
    return;
  }

  const cookieState: string = (req.cookies as Record<string, string>)?.oauth_state ?? '';
  const queryState: string = (req.query.state as string) ?? '';

  if (!verifyState(cookieState, queryState)) {
    res.clearCookie('oauth_state');
    res.redirect(`${config.CORS_ORIGIN}/login?error=state_mismatch`);
    return;
  }

  res.clearCookie('oauth_state');

  try {
    const tokens = await exchangeCodeForTokens(req.query.code as string);
    const profile = decodeIdToken(tokens.id_token);
    const user = await upsertUser(profile, tokens);
    const jwt = signAccessToken({ userId: user.id, email: user.email });

    res.cookie('trakk_session', jwt, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${config.CORS_ORIGIN}/callback`);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 409) {
      res.redirect(`${config.CORS_ORIGIN}/login?error=account_conflict`);
      return;
    }
    res.redirect(`${config.CORS_ORIGIN}/login?error=auth_failed`);
  }
});

// GET /me — get current user
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.user!.userId);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// PATCH /me — update display name and/or theme preference
authRouter.patch('/me', requireAuth, validate(patchMeSchema), async (req, res, next) => {
  try {
    const { displayName, themePreference } = req.body as { displayName?: string; themePreference?: string };
    const user = await updateMe(req.user!.userId, { displayName, themePreference });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// POST /logout
authRouter.post('/logout', requireAuth, (req, res) => {
  res.clearCookie('trakk_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
  });
  res.status(200).json({ message: 'Logged out' });
});

// POST /disconnect
authRouter.post('/disconnect', requireAuth, async (req, res, next) => {
  try {
    await disconnectUser(req.user!.userId);
    res.clearCookie('trakk_session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
    });
    res.status(200).json({ message: 'Account disconnected' });
  } catch (error) {
    next(error);
  }
});

// DELETE /me — full account deletion with CSRF check
authRouter.delete('/me', requireAuth, async (req, res, next) => {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    return next(new AppError(415, 'Content-Type must be application/json'));
  }
  try {
    await disconnectUser(req.user!.userId);
    res.clearCookie('trakk_session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
    });
    res.status(200).json({ message: 'Account deleted' });
  } catch (error) {
    next(error);
  }
});

// POST /google/disconnect — soft Google disconnect (removes OAuthAccount, ends session)
authRouter.post('/google/disconnect', requireAuth, async (req, res, next) => {
  try {
    await softDisconnectGoogle(req.user!.userId);
    res.clearCookie('trakk_session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
    });
    res.status(200).json({ message: 'Google account disconnected' });
  } catch (error) {
    next(error);
  }
});

// POST /me/avatar — upload custom avatar
authRouter.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError(400, 'No file uploaded.'));
    }
    const result = await uploadAvatar(req.user!.userId, {
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// DELETE /me/avatar — delete custom avatar
authRouter.delete('/me/avatar', requireAuth, async (req, res, next) => {
  try {
    const user = await deleteAvatar(req.user!.userId);
    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
});
