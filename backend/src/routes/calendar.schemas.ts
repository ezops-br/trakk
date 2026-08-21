import { z } from 'zod';

export const getEventsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
  maxResults: z
    .string()
    .optional()
    .transform(val => (val !== undefined ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(1).max(50).optional()),
});

export type GetEventsQuery = z.infer<typeof getEventsQuerySchema>;
