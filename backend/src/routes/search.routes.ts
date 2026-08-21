import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { searchQuerySchema } from './search.schemas';
import { search } from '../services/search.service';

const router = Router();
router.use(requireAuth);

router.get('/', validate(searchQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { q, project, limit } = req.query as unknown as {
      q: string;
      project?: string;
      limit: number;
    };
    const userId = req.user!.userId;
    const results = await search(userId, q, { projectId: project, limit });
    // No envelope wrapper — flat { tickets, projects }
    res.json(results);
  } catch (err) {
    next(err);
  }
});

export { router as searchRouter };
