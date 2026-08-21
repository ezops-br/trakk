import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { badRequest, unauthorized, notFound, conflict } from '../lib/app-error';
import { errorHandler } from './error-handler';

function buildApp(thrower: (req: express.Request) => unknown) {
  const app = express();
  app.get('/test', (req, _res, next) => {
    try {
      thrower(req);
    } catch (err) {
      next(err);
    }
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('responds with AppError statusCode and message', async () => {
    const app = buildApp(() => { throw badRequest('Bad input', 'name is required'); });
    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad input');
    expect(res.body.details).toBe('name is required');
  });

  it('omits details key when AppError has no details', async () => {
    const app = buildApp(() => { throw unauthorized(); });
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('details');
  });

  it('maps 404 AppError correctly', async () => {
    const app = buildApp(() => { throw notFound('Project not found'); });
    const res = await request(app).get('/test');
    expect(res.status).toBe(404);
  });

  it('maps 409 AppError correctly', async () => {
    const app = buildApp(() => { throw conflict('Duplicate key'); });
    const res = await request(app).get('/test');
    expect(res.status).toBe(409);
  });

  it('maps ZodError to 400 with details', async () => {
    const schema = z.object({ name: z.string() });
    const app = buildApp(() => { schema.parse({}); });
    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContain('name');
  });

  it('maps Prisma P2002 to 409', async () => {
    const app = buildApp(() => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
    });
    const res = await request(app).get('/test');
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('maps Prisma P2025 to 404', async () => {
    const app = buildApp(() => {
      throw new Prisma.PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
    });
    const res = await request(app).get('/test');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Record not found');
  });

  it('returns 500 for unknown errors and does not expose the message', async () => {
    const app = buildApp(() => { throw new Error('super secret internal failure'); });
    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toContain('super secret');
  });
});
