import { z } from 'zod';

export const linkTypeSchema = z.enum(['BLOCKS', 'RELATES_TO', 'DUPLICATES']);

export const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

export const ticketNumberParamSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().positive(),
});

export const ticketLinkIdParamSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().positive(),
  linkId: z.string().uuid(),
});

export const createTicketLinkBodySchema = z.object({
  targetTicketNumber: z.coerce.number().int().positive(),
  type: linkTypeSchema,
});

export const ticketIdParamSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().positive(),
  linkId: z.string().uuid().optional(),
});

export type LinkType = z.infer<typeof linkTypeSchema>;
export type CreateTicketLinkBody = z.infer<typeof createTicketLinkBodySchema>;
