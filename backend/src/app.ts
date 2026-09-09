import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { errorHandler } from './middleware/error-handler';
import { apiRateLimit } from './middleware/rate-limit';
import { prisma } from './lib/prisma';
import { authRouter } from './routes/auth.routes';
import { projectRouter } from './routes/project.routes';
import { memberRouter } from './routes/member.routes';
import { columnRouter } from './routes/column.routes';
import { ticketRouter } from './routes/ticket.routes';
import { labelRouter } from './routes/label.routes';
import { ticketTemplateRouter } from './routes/ticket-template.routes';
import { eventsRouter } from './routes/events.routes';
import { commentRouter } from './routes/comment.routes';
import { ticketLinkRouter } from './routes/ticket-link.routes';
import { ticketAttachmentRouter } from './routes/ticket-attachment.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { searchRouter } from './routes/search.routes';

const app = express();

// Trust the first proxy (nginx) so req.ip and rate-limit key reflect the real client IP
app.set('trust proxy', 1);

app.use(helmet());
// See config.ts's DISABLE_APP_CORS for why this is conditional.
if (config.DISABLE_APP_CORS !== 'true') {
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
}
app.use(express.json());
app.use(morgan('combined'));
app.use(cookieParser());

// Attach a unique request ID to every request and surface it as a response header
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

app.get('/api/v1/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable', timestamp: new Date().toISOString() });
  }
});

// Serve uploaded avatars
app.use(
  '/api/v1/uploads/avatars',
  (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(process.cwd(), process.env.AVATAR_UPLOAD_DIR ?? 'uploads/avatars')),
);

// Ticket attachments are no longer served as static files from disk; bytes
// live in Postgres and are streamed via the authenticated GET .../raw route
// on the ticket-attachment router. Keeping the avatars mount above — the
// avatar storage path is unchanged.
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/projects', apiRateLimit, projectRouter);
app.use('/api/v1/projects', apiRateLimit, memberRouter);
app.use('/api/v1/projects', apiRateLimit, columnRouter);
app.use('/api/v1/projects', apiRateLimit, ticketRouter);
app.use('/api/v1/projects', apiRateLimit, labelRouter);
app.use('/api/v1/projects', apiRateLimit, ticketTemplateRouter);
app.use('/api/v1/projects', apiRateLimit, eventsRouter);
app.use('/api/v1/projects', apiRateLimit, commentRouter);
app.use('/api/v1/projects', apiRateLimit, ticketLinkRouter);
app.use('/api/v1/projects', apiRateLimit, ticketAttachmentRouter);
app.use('/api/v1/dashboard', apiRateLimit, dashboardRouter);
app.use('/api/v1/search', apiRateLimit, searchRouter);

// Error handler must be the last middleware registered
app.use(errorHandler);

export default app;
