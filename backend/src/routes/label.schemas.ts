import { z } from 'zod';

export const createLabelSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex color e.g. #FF0000'),
});

export const updateLabelSchema = createLabelSchema
  .partial()
  .refine((d) => d.name !== undefined || d.color !== undefined, {
    message: 'At least one field required',
  });

export const labelParamsSchema = z.object({
  projectId: z.string().uuid(),
  labelId: z.string().uuid(),
});

export const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});
