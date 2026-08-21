import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as labelService from '../services/label.service';
import {
  createLabelSchema,
  updateLabelSchema,
  labelParamsSchema,
  projectParamsSchema,
} from './label.schemas';

export const labelRouter = Router();

labelRouter.use(requireAuth);

// GET /:projectId/labels — list all labels (any project member)
labelRouter.get(
  '/:projectId/labels',
  validate(projectParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const labels = await labelService.listLabels(req.user!.userId, req.params.projectId);
      res.json({ labels });
    } catch (error) {
      next(error);
    }
  },
);

// POST /:projectId/labels — create a label (OWNER only)
labelRouter.post(
  '/:projectId/labels',
  validate(projectParamsSchema, 'params'),
  validate(createLabelSchema),
  async (req, res, next) => {
    try {
      const label = await labelService.createLabel(
        req.user!.userId,
        req.params.projectId,
        req.body,
      );
      res.status(201).json({ label });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /:projectId/labels/:labelId — update a label (OWNER only)
labelRouter.patch(
  '/:projectId/labels/:labelId',
  validate(labelParamsSchema, 'params'),
  validate(updateLabelSchema),
  async (req, res, next) => {
    try {
      const label = await labelService.updateLabel(
        req.user!.userId,
        req.params.projectId,
        req.params.labelId,
        req.body,
      );
      res.json({ label });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /:projectId/labels/:labelId — delete a label and its ticket associations (OWNER only)
labelRouter.delete(
  '/:projectId/labels/:labelId',
  validate(labelParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      await labelService.deleteLabel(
        req.user!.userId,
        req.params.projectId,
        req.params.labelId,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
