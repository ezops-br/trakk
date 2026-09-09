import { z } from 'zod';

const PRIORITY = z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE']);

export const createTicketSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().nullable().optional(),
    statusColumnId: z.string().uuid(),
    priority: PRIORITY.optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    dueDate: z.string().datetime().optional().nullable(),
  })
  .strict();

export const updateTicketSchema = createTicketSchema
  .extend({
    assigneeId: z.string().uuid().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
  })
  .strict()
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field required',
  });

const LIST_SORT = z.enum([
  'sortOrder',
  'priority',
  'dueDate',
  'createdAt',
  'updatedAt',
  'number',
  'assignee',
]);

const LIST_ORDER = z.enum(['asc', 'desc']);

const DUE_DATE_FILTER = z.enum(['overdue', 'today', 'this_week', 'this_month']);

export const listTicketsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  statusColumnId: z.string().uuid().optional(),
  priority: PRIORITY.optional(),
  assigneeId: z.string().uuid().optional(),
  labelId: z.string().uuid().optional(),
  q: z.string().optional(),
  sort: LIST_SORT.optional(),
  order: LIST_ORDER.optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  dueDateFilter: DUE_DATE_FILTER.optional(),
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

// ─── bulkUpdateTickets ────────────────────────────────────────────────────────

const ticketNumbersSchema = z
  .array(z.number().int().positive())
  .min(1, 'At least one ticket number is required')
  .max(100, 'Cannot update more than 100 tickets at once');

// Base shape that allows unknown keys so we can reject extras (notably `value`
// for the `delete` operation). `passthrough` keeps the input intact for the
// post-discriminated-union refinement below.
const bulkUpdateBaseSchema = z
  .object({
    ticketNumbers: ticketNumbersSchema,
    operation: z.string(),
    value: z.unknown().optional(),
  })
  .passthrough();

export const bulkUpdateTicketsSchema = bulkUpdateBaseSchema.transform((data, ctx) => {
  // value: required for everything except `delete`.
  const requiresValue = data.operation !== 'delete';
  if (requiresValue && (data.value === undefined || data.value === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: `value is required for ${data.operation} operation`,
    });
    return z.NEVER;
  }
  if (!requiresValue && data.value !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'value must be omitted for delete operation',
    });
    return z.NEVER;
  }
  return data;
}).pipe(
  z.discriminatedUnion('operation', [
    z.object({
      ticketNumbers: ticketNumbersSchema,
      operation: z.literal('status'),
      value: z.string().uuid('value is required for status operation'),
    }),
    z.object({
      ticketNumbers: ticketNumbersSchema,
      operation: z.literal('priority'),
      value: PRIORITY,
    }),
    z.object({
      ticketNumbers: ticketNumbersSchema,
      operation: z.literal('assignee'),
      value: z.string().min(1, 'value is required for assignee operation'),
    }),
    z.object({
      ticketNumbers: ticketNumbersSchema,
      operation: z.literal('addLabel'),
      value: z.string().uuid('value is required for addLabel operation'),
    }),
    z.object({
      ticketNumbers: ticketNumbersSchema,
      operation: z.literal('removeLabel'),
      value: z.string().uuid('value is required for removeLabel operation'),
    }),
    z.object({
      ticketNumbers: ticketNumbersSchema,
      operation: z.literal('delete'),
    }),
  ]),
);

export type BulkUpdateTicketsInput = z.infer<typeof bulkUpdateTicketsSchema>;
