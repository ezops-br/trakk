import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as commentService from '../services/comment.service';
import {
  commentBodySchema,
  ticketCommentParamsSchema,
  commentParamsSchema,
} from './comment.schemas';

export const commentRouter = Router();

commentRouter.use(requireAuth);

// GET /:projectId/tickets/:ticketNumber/comments — list comments (any member including VIEWER)
commentRouter.get(
  '/:projectId/tickets/:ticketNumber/comments',
  validate(ticketCommentParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const result = await commentService.listComments(
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

// POST /:projectId/tickets/:ticketNumber/comments — create a comment (MEMBER or OWNER)
commentRouter.post(
  '/:projectId/tickets/:ticketNumber/comments',
  validate(ticketCommentParamsSchema, 'params'),
  validate(commentBodySchema),
  async (req, res, next) => {
    try {
      const result = await commentService.createComment(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
        req.body.body,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /:projectId/tickets/:ticketNumber/comments/:commentId — update a comment (author only)
commentRouter.patch(
  '/:projectId/tickets/:ticketNumber/comments/:commentId',
  validate(commentParamsSchema, 'params'),
  validate(commentBodySchema),
  async (req, res, next) => {
    try {
      const result = await commentService.updateComment(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
        req.params.commentId,
        req.body.body,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /:projectId/tickets/:ticketNumber/comments/:commentId — delete a comment (author or OWNER)
commentRouter.delete(
  '/:projectId/tickets/:ticketNumber/comments/:commentId',
  validate(commentParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      await commentService.deleteComment(
        req.user!.userId,
        req.params.projectId,
        Number(req.params.ticketNumber),
        req.params.commentId,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
