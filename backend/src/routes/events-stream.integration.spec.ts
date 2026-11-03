import http, { type IncomingHttpHeaders } from 'node:http';
import express from 'express';
import request from 'supertest';
import { requireAuth } from '../middleware/auth';
import { errorHandler } from '../middleware/error-handler';
import { prisma } from '../lib/prisma';
import { broadcast } from '../lib/event-broadcaster';
import { broadcastToDashboard } from '../lib/dashboard-event-broadcaster';
import { eventsRouter } from './events.routes';
import { dashboardRouter } from './dashboard.routes';

jest.mock('../middleware/auth');
jest.mock('../lib/prisma', () => ({
  prisma: { projectMember: { findFirst: jest.fn() } },
}));
jest.mock('../services/dashboard.service', () => ({ getDashboardData: jest.fn() }));

const projectId = '7f9b4d38-a901-4b38-9bef-5deeb94a1540';
const userId = 'preview-member';
const streams = [
  { path: `/api/v1/projects/${projectId}/events`, publish: () => broadcast(projectId, 'ticket.updated', {}) },
  { path: '/api/v1/dashboard/events', publish: () => broadcastToDashboard(userId, 'ticket.updated', {}) },
];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/projects', eventsRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.mocked(requireAuth).mockImplementation((req, _res, next) => {
    req.user = { userId, email: 'member@example.com' };
    next();
  });
  (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue({ userId, projectId });
});

describe('SANDBOX-PREVIEW-001 S06: unbuffered authenticated events', () => {
  it.each(streams.flatMap((stream) => [
    { ...stream, transport: 'ordinary GET', headers: {} },
    { ...stream, transport: 'zero-length proxy GET', headers: { 'Content-Length': '0' } },
    { ...stream, transport: 'parsed zero-length proxy GET', headers: { 'Content-Length': '0', 'Content-Type': 'application/json' } },
  ]))('$path declares no-transform and sends an event on $transport', async ({ path, publish, headers }) => {
    const server = http.createServer(buildApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    let client: http.ClientRequest | undefined;
    try {
      const result = await new Promise<{ headers: IncomingHttpHeaders; frame: string }>((resolve, reject) => {
        client = http.get({ hostname: '127.0.0.1', port: (server.address() as { port: number }).port, path, headers }, (res) => {
          let frame = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            frame += chunk;
            if (frame.endsWith('\n\n')) {
              resolve({ headers: res.headers, frame });
              res.destroy();
            }
          });
          publish();
        });
        client.setTimeout(1500, () => client?.destroy(new Error('SSE event did not arrive')));
        client.on('error', reject);
      });
      expect(result.headers['content-type']).toContain('text/event-stream');
      expect(result.headers['cache-control']).toBe('no-cache, no-transform');
      expect(result.headers['x-accel-buffering']).toBe('no');
      expect(JSON.parse(result.frame.slice(6))).toMatchObject({ type: 'ticket.updated' });
    } finally {
      client?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it.each(streams)('$path still requires authentication', async ({ path }) => {
    jest.mocked(requireAuth).mockImplementation((_req, res) => { res.sendStatus(401); });
    await request(buildApp()).get(path).expect(401);
  });

  it('still rejects a project nonmember before opening the stream', async () => {
    (prisma.projectMember.findFirst as jest.Mock).mockResolvedValue(null);
    await request(buildApp()).get(streams[0].path).expect(403);
  });
});
