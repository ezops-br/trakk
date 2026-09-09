import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ticketLinkService from '../services/ticket-link.service';
import {
  ticketLinkIdParamSchema,
  ticketNumberParamSchema,
  createTicketLinkBodySchema,
} from './ticket-link.schemas';

export const ticketLinkRouter = Router();

ticketLinkRouter.use(requireAuth);

// GET /projects/:projectId/tickets/:ticketNumber/links
ticketLinkRouter.get(
  '/:projectId/tickets/:ticketNumber/links',
  validate(ticketNumberParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const result = await ticketLinkService.listLinks(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /projects/:projectId/tickets/:ticketNumber/links
ticketLinkRouter.post(
  '/:projectId/tickets/:ticketNumber/links',
  validate(ticketNumberParamSchema, 'params'),
  validate(createTicketLinkBodySchema),
  async (req, res, next) => {
    try {
      const result = await ticketLinkService.createLink(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
        req.body,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /projects/:projectId/tickets/:ticketNumber/links/:linkId
ticketLinkRouter.delete(
  '/:projectId/tickets/:ticketNumber/links/:linkId',
  validate(ticketLinkIdParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const result = await ticketLinkService.deleteLink(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
        req.params.linkId,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);
