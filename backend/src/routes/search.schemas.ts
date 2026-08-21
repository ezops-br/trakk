import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z
    .string({ required_error: 'q is required' })
    .trim()
    .min(2, 'q must be at least 2 characters')
    .max(200, 'q must be at most 200 characters'),
  project: z.string().uuid('project must be a valid UUID').optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? 20 : parseInt(val, 10)))
    .pipe(z.number().int().min(1).max(50)),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
