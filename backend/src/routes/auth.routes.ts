import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { authRateLimit } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import {
  verifyCredentials,
  findUserById,
  updateMe,
  disconnectUser,
  uploadAvatar,
  deleteAvatar,
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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = Router();

// Shared trakk_session cookie attributes — see config.ts's SESSION_COOKIE_DOMAIN
// for why domain is conditional. clearCookie must match the exact attributes
// used to set it (name/domain/path), or the browser treats it as a different
// cookie and the original is never actually removed.
const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.NODE_ENV === 'production',
  ...(config.SESSION_COOKIE_DOMAIN ? { domain: config.SESSION_COOKIE_DOMAIN } : {}),
};

// No self-serve registration by design — users are provisioned via prisma/seed.ts only.
// POST /login
authRouter.post('/login', authRateLimit, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const user = await verifyCredentials(email, password);
    const jwt = signAccessToken({ userId: user.id, email: user.email });

    res.cookie('trakk_session', jwt, {
      ...sessionCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json(user);
  } catch (error) {
    next(error);
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
  res.clearCookie('trakk_session', sessionCookieOptions);
  res.status(200).json({ message: 'Logged out' });
});

// POST /disconnect
authRouter.post('/disconnect', requireAuth, async (req, res, next) => {
  try {
    await disconnectUser(req.user!.userId);
    res.clearCookie('trakk_session', sessionCookieOptions);
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
    res.clearCookie('trakk_session', sessionCookieOptions);
    res.status(200).json({ message: 'Account deleted' });
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
