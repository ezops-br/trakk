import { z } from 'zod';

export const createColumnSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateColumnSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((d) => d.name !== undefined || d.position !== undefined, {
    message: 'At least one field required',
  });

export const deleteColumnBodySchema = z.object({
  migrationTargetColumnId: z.string().uuid(),
});

export const columnParamsSchema = z.object({
  projectId: z.string().uuid(),
  columnId: z.string().uuid(),
});

export const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});
