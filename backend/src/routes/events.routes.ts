import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../lib/prisma';
import { forbidden } from '../lib/app-error';
import { subscribe, unsubscribe } from '../lib/event-broadcaster';
import { projectParamsSchema } from './ticket.schemas';

export const eventsRouter = Router();

eventsRouter.use(requireAuth);

const KEEPALIVE_INTERVAL_MS = 30_000;

// GET /:projectId/events — Server-Sent Events stream for live project updates.
eventsRouter.get(
  '/:projectId/events',
  validate(projectParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { projectId } = req.params;

      // Only project members may subscribe to a project's event stream.
      const member = await prisma.projectMember.findFirst({
        where: { userId: req.user!.userId, projectId },
      });
      if (!member) {
        throw forbidden();
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      subscribe(projectId, res);

      const keepalive = setInterval(() => {
        res.write(': keepalive\n\n');
      }, KEEPALIVE_INTERVAL_MS);

      req.on('close', () => {
        clearInterval(keepalive);
        unsubscribe(projectId, res);
      });
    } catch (error) {
      next(error);
    }
  },
);
