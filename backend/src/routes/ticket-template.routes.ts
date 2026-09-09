import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createTemplateSchema,
  updateTemplateSchema,
  templateParamsSchema,
  projectParamsSchema,
} from './ticket-template.schemas';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../services/ticket-template.service';

export const ticketTemplateRouter = Router({ mergeParams: true });

ticketTemplateRouter.use(requireAuth);

ticketTemplateRouter.get(
  '/:projectId/templates',
  validate(projectParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const result = await listTemplates(req.user!.userId, req.params.projectId);
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);

ticketTemplateRouter.post(
  '/:projectId/templates',
  validate(projectParamsSchema, 'params'),
  validate(createTemplateSchema),
  async (req, res, next) => {
    try {
      const result = await createTemplate(
        req.user!.userId,
        req.params.projectId,
        req.body,
      );
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  },
);

ticketTemplateRouter.patch(
  '/:projectId/templates/:templateId',
  validate(templateParamsSchema, 'params'),
  validate(updateTemplateSchema),
  async (req, res, next) => {
    try {
      const result = await updateTemplate(
        req.user!.userId,
        req.params.projectId,
        req.params.templateId,
        req.body,
      );
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);

ticketTemplateRouter.delete(
  '/:projectId/templates/:templateId',
  validate(templateParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      await deleteTemplate(
        req.user!.userId,
        req.params.projectId,
        req.params.templateId,
      );
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);