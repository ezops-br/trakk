import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  listMeetings,
  scheduleMeeting,
  updateMeeting,
  cancelMeeting,
  startInstantMeeting,
} from '../services/meeting.service';
import {
  meetingParamsSchema,
  ticketMeetingParamsSchema,
  listMeetingsQuerySchema,
  scheduleMeetingSchema,
  updateMeetingSchema,
} from './meeting.schemas';

const router = Router();
router.use(requireAuth);

// GET /:projectId/tickets/:ticketNumber/meetings
router.get(
  '/:projectId/tickets/:ticketNumber/meetings',
  validate(ticketMeetingParamsSchema, 'params'),
  validate(listMeetingsQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const { projectId, ticketNumber } = req.params as unknown as {
        projectId: string;
        ticketNumber: number;
      };
      const { cursor } = req.query as { cursor?: string };
      const result = await listMeetings(req.user!.userId, projectId, ticketNumber, { cursor });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// IMPORTANT: /instant must be registered before /:meetingId to avoid conflict
// POST /:projectId/tickets/:ticketNumber/meetings/instant
router.post(
  '/:projectId/tickets/:ticketNumber/meetings/instant',
  validate(ticketMeetingParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { projectId, ticketNumber } = req.params as unknown as {
        projectId: string;
        ticketNumber: number;
      };
      const result = await startInstantMeeting(req.user!.userId, projectId, ticketNumber);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:projectId/tickets/:ticketNumber/meetings
router.post(
  '/:projectId/tickets/:ticketNumber/meetings',
  validate(ticketMeetingParamsSchema, 'params'),
  validate(scheduleMeetingSchema, 'body'),
  async (req, res, next) => {
    try {
      const { projectId, ticketNumber } = req.params as unknown as {
        projectId: string;
        ticketNumber: number;
      };
      const result = await scheduleMeeting(req.user!.userId, projectId, ticketNumber, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /:projectId/tickets/:ticketNumber/meetings/:meetingId
router.patch(
  '/:projectId/tickets/:ticketNumber/meetings/:meetingId',
  validate(meetingParamsSchema, 'params'),
  validate(updateMeetingSchema, 'body'),
  async (req, res, next) => {
    try {
      const { projectId, ticketNumber, meetingId } = req.params as unknown as {
        projectId: string;
        ticketNumber: number;
        meetingId: string;
      };
      const result = await updateMeeting(
        req.user!.userId,
        projectId,
        ticketNumber,
        meetingId,
        req.body,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /:projectId/tickets/:ticketNumber/meetings/:meetingId
router.delete(
  '/:projectId/tickets/:ticketNumber/meetings/:meetingId',
  validate(meetingParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { projectId, ticketNumber, meetingId } = req.params as unknown as {
        projectId: string;
        ticketNumber: number;
        meetingId: string;
      };
      const result = await cancelMeeting(req.user!.userId, projectId, ticketNumber, meetingId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as meetingRouter };
