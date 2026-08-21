import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  createProjectSchema,
  updateProjectSchema,
  archiveProjectSchema,
} from './project.schemas';
import {
  listProjectsByUser,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  toggleArchiveProject,
} from '../services/project.service';

export const projectRouter = Router();

// All project routes require an authenticated session.
projectRouter.use(requireAuth);

// GET / — list projects the user belongs to
projectRouter.get('/', async (req, res, next) => {
  try {
    const projects = await listProjectsByUser(req.user!.userId);
    res.json({ projects });
  } catch (error) {
    next(error);
  }
});

// POST / — create a new project
projectRouter.post('/', validate(createProjectSchema), async (req, res, next) => {
  try {
    const project = await createProject(req.body, req.user!.userId);
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

// GET /:id — get a single project
projectRouter.get('/:id', async (req, res, next) => {
  try {
    const project = await getProjectById(req.params.id, req.user!.userId);
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

// PATCH /:id — update a project (OWNER only)
projectRouter.patch('/:id', validate(updateProjectSchema), async (req, res, next) => {
  try {
    const project = await updateProject(req.params.id, req.user!.userId, req.body);
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

// DELETE /:id — delete a project (OWNER only)
projectRouter.delete('/:id', async (req, res, next) => {
  try {
    await deleteProject(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// PATCH /:id/archive — archive or unarchive a project (OWNER only)
projectRouter.patch('/:id/archive', validate(archiveProjectSchema), async (req, res, next) => {
  try {
    const project = await toggleArchiveProject(
      req.params.id,
      req.user!.userId,
      req.body.archive,
    );
    res.json({ project });
  } catch (error) {
    next(error);
  }
});
