import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { badRequest } from '../lib/app-error';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.errors
        .map(e => `${e.path.join('.') || 'value'}: ${e.message}`)
        .join('; ');
      next(badRequest('Validation failed', details));
      return;
    }
    // Replace the source with the coerced/parsed output
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as Record<string, any>)[source] = result.data;
    next();
  };
}
