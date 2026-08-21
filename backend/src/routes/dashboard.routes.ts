import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDashboardData } from '../services/dashboard.service';
import { subscribeToDashboard, unsubscribeFromDashboard } from '../lib/dashboard-event-broadcaster';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const data = await getDashboardData(req.user!.userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/events', (req, res) => {
  const userId = req.user!.userId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  subscribeToDashboard(userId, res);

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribeFromDashboard(userId, res);
  });
});

export { router as dashboardRouter };
