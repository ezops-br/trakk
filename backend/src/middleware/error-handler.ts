import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/app-error';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const details = err.errors
      .map(e => `${e.path.join('.') || 'value'}: ${e.message}`)
      .join('; ');
    res.status(400).json({ error: 'Validation failed', details });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(JSON.stringify({ prismaCode: err.code, message: err.message, meta: err.meta }));
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'A record with this value already exists' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    res.status(400).json({ error: 'Database request error' });
    return;
  }

  const requestId = req.headers['x-request-id'];
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: Array.isArray(requestId) ? requestId[0] : requestId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );

  res.status(500).json({ error: 'Internal server error' });
}
