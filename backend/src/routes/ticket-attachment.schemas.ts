import { z } from 'zod';

export const ticketAttachmentParamsSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().positive(),
});

export const ticketAttachmentIdParamSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().positive(),
  attachmentId: z.string().uuid(),
});

export type TicketAttachmentParams = z.infer<typeof ticketAttachmentParamsSchema>;
export type TicketAttachmentIdParams = z.infer<typeof ticketAttachmentIdParamSchema>;