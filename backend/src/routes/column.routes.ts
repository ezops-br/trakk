import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as columnService from '../services/column.service';
import {
  createColumnSchema,
  updateColumnSchema,
  deleteColumnBodySchema,
  columnParamsSchema,
  projectParamsSchema,
} from './column.schemas';

export const columnRouter = Router();

columnRouter.use(requireAuth);

// GET /:projectId/columns — list all columns (any project member)
columnRouter.get(
  '/:projectId/columns',
  validate(projectParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const columns = await columnService.listColumns(req.user!.userId, req.params.projectId);
      res.json({ columns });
    } catch (error) {
      next(error);
    }
  },
);

// POST /:projectId/columns — create a column (OWNER only)
columnRouter.post(
  '/:projectId/columns',
  validate(projectParamsSchema, 'params'),
  validate(createColumnSchema),
  async (req, res, next) => {
    try {
      const column = await columnService.createColumn(
        req.user!.userId,
        req.params.projectId,
        req.body.name,
      );
      res.status(201).json({ column });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /:projectId/columns/:columnId — update or reposition a column (OWNER only)
columnRouter.patch(
  '/:projectId/columns/:columnId',
  validate(columnParamsSchema, 'params'),
  validate(updateColumnSchema),
  async (req, res, next) => {
    try {
      const column = await columnService.updateColumn(
        req.user!.userId,
        req.params.projectId,
        req.params.columnId,
        req.body,
      );
      res.json({ column });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /:projectId/columns/:columnId — delete a column, migrating its tickets (OWNER only)
columnRouter.delete(
  '/:projectId/columns/:columnId',
  validate(columnParamsSchema, 'params'),
  validate(deleteColumnBodySchema),
  async (req, res, next) => {
    try {
      await columnService.deleteColumn(
        req.user!.userId,
        req.params.projectId,
        req.params.columnId,
        req.body.migrationTargetColumnId,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
