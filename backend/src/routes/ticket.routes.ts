import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as ticketService from '../services/ticket.service';
import {
  createTicketSchema,
  updateTicketSchema,
  listTicketsSchema,
  reorderTicketsSchema,
  archiveTicketSchema,
  addLabelSchema,
  ticketParamsSchema,
  ticketLabelParamsSchema,
  projectParamsSchema,
} from './ticket.schemas';

export const ticketRouter = Router();

ticketRouter.use(requireAuth);

// GET /:projectId/tickets — list tickets with filters and pagination (any member)
ticketRouter.get(
  '/:projectId/tickets',
  validate(projectParamsSchema, 'params'),
  validate(listTicketsSchema, 'query'),
  async (req, res, next) => {
    try {
      const result = await ticketService.listTickets(
        req.user!.userId,
        req.params.projectId,
        req.query as Record<string, unknown>,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /:projectId/tickets — create a ticket (MEMBER or OWNER)
ticketRouter.post(
  '/:projectId/tickets',
  validate(projectParamsSchema, 'params'),
  validate(createTicketSchema),
  async (req, res, next) => {
    try {
      const ticket = await ticketService.createTicket(
        req.user!.userId,
        req.params.projectId,
        req.body,
      );
      res.status(201).json({ ticket });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /:projectId/tickets/reorder — bulk reorder (MEMBER or OWNER)
// MUST be registered before /:ticketNumber so "reorder" is not parsed as a number.
ticketRouter.patch(
  '/:projectId/tickets/reorder',
  validate(projectParamsSchema, 'params'),
  validate(reorderTicketsSchema),
  async (req, res, next) => {
    try {
      const result = await ticketService.reorderTickets(
        req.user!.userId,
        req.params.projectId,
        req.body.updates,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /:projectId/tickets/:ticketNumber — fetch a single ticket (any member)
ticketRouter.get(
  '/:projectId/tickets/:ticketNumber',
  validate(ticketParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const raw = await ticketService.getTicketByNumber(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
      );
      const { activityLogs, ...rest } = raw;
      res.json({ ticket: { ...rest, activityLog: activityLogs } });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /:projectId/tickets/:ticketNumber — update a ticket (MEMBER or OWNER)
ticketRouter.patch(
  '/:projectId/tickets/:ticketNumber',
  validate(ticketParamsSchema, 'params'),
  validate(updateTicketSchema),
  async (req, res, next) => {
    try {
      const ticket = await ticketService.updateTicket(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
        req.body,
      );
      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /:projectId/tickets/:ticketNumber — delete a ticket (MEMBER or OWNER)
ticketRouter.delete(
  '/:projectId/tickets/:ticketNumber',
  validate(ticketParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      await ticketService.deleteTicket(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /:projectId/tickets/:ticketNumber/archive — archive or restore (MEMBER or OWNER)
ticketRouter.patch(
  '/:projectId/tickets/:ticketNumber/archive',
  validate(ticketParamsSchema, 'params'),
  validate(archiveTicketSchema),
  async (req, res, next) => {
    try {
      const ticket = await ticketService.toggleArchiveTicket(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
        req.body.archive,
      );
      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  },
);

// POST /:projectId/tickets/:ticketNumber/labels — add a label (MEMBER or OWNER)
ticketRouter.post(
  '/:projectId/tickets/:ticketNumber/labels',
  validate(ticketParamsSchema, 'params'),
  validate(addLabelSchema),
  async (req, res, next) => {
    try {
      const ticket = await ticketService.addLabelToTicket(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
        req.body.labelId,
      );
      res.status(201).json({ ticket });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /:projectId/tickets/:ticketNumber/labels/:labelId — remove a label (MEMBER or OWNER)
ticketRouter.delete(
  '/:projectId/tickets/:ticketNumber/labels/:labelId',
  validate(ticketLabelParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const ticket = await ticketService.removeLabelFromTicket(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
        req.params.labelId,
      );
      res.json({ ticket });
    } catch (error) {
      next(error);
    }
  },
);
