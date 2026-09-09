import { z } from 'zod';
import { Priority } from '@prisma/client';

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  titleTemplate: z.string().max(200).optional(),
  descriptionTemplate: z.string().max(10000).optional(),
  defaultPriority: z.nativeEnum(Priority).optional(),
  defaultLabelIds: z.array(z.string().uuid()).optional(),
});

export const updateTemplateSchema = createTemplateSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field required' });

export const templateParamsSchema = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().uuid(),
});

export const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});