import { z } from 'zod';

export const commentBodySchema = z.object({
  body: z.string().trim().min(1).max(10000),
});

export const ticketCommentParamsSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().positive(),
});

export const commentParamsSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().positive(),
  commentId: z.string().uuid(),
});
