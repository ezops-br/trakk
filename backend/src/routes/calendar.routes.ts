import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getEventsQuerySchema } from './calendar.schemas';
import { prisma } from '../lib/prisma';
import { getRefreshedAccessToken } from '../services/google-oauth.service';
import { getUpcomingEvents } from '../services/google-calendar.service';

const router = Router();
router.use(requireAuth);

router.get(
  '/events',
  validate(getEventsQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { date, maxResults } = req.query as { date?: string; maxResults?: number };
      const userId = req.user!.userId;

      const oauthAccount = await prisma.oAuthAccount.findFirst({
        where: { userId, provider: 'google' },
      });

      if (!oauthAccount?.refreshTokenEnc) {
        return res.json({ events: [], calendarConnected: false });
      }

      let accessToken: string;
      try {
        accessToken = await getRefreshedAccessToken(oauthAccount.refreshTokenEnc);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('invalid_grant')) {
          return res.json({ events: [], calendarConnected: false, needsReauth: true });
        }
        return res.json({ events: [], calendarConnected: true, error: 'Calendar temporarily unavailable' });
      }

      let events: Awaited<ReturnType<typeof getUpcomingEvents>>;
      try {
        events = await getUpcomingEvents(accessToken, { date, maxResults });
      } catch {
        return res.json({ events: [], calendarConnected: true, error: 'Calendar temporarily unavailable' });
      }

      return res.json({ events, calendarConnected: true });
    } catch (err) {
      next(err);
    }
  },
);

export { router as calendarRouter };
