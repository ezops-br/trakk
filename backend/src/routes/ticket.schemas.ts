import { z } from 'zod';

const PRIORITY = z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']);

export const createTicketSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  statusColumnId: z.string().uuid(),
  priority: PRIORITY.optional(),
  assigneeId: z.string().uuid().optional(),
});

export const updateTicketSchema = createTicketSchema
  .extend({ assigneeId: z.string().uuid().nullable().optional() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field required',
  });

export const listTicketsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  statusColumnId: z.string().uuid().optional(),
  priority: PRIORITY.optional(),
  assigneeId: z.string().uuid().optional(),
  labelId: z.string().uuid().optional(),
  q: z.string().optional(),
});

export const reorderTicketsSchema = z.object({
  updates: z
    .array(
      z.object({
        ticketId: z.string().uuid(),
        sortOrder: z.number(),
        statusColumnId: z.string().uuid().optional(),
      }),
    )
    .min(1),
});

export const archiveTicketSchema = z.object({
  archive: z.boolean(),
});

export const addLabelSchema = z.object({
  labelId: z.string().uuid(),
});

export const ticketParamsSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().min(1),
});

export const ticketLabelParamsSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().min(1),
  labelId: z.string().uuid(),
});

export const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});
