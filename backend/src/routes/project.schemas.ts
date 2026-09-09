import { z } from 'zod';

const keyRegex = /^[A-Z0-9]{2,10}$/;

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  key: z
    .string()
    .regex(keyRegex, 'Key must be 2-10 uppercase letters or digits'),
  description: z.string().max(1000).optional().nullable(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    key: z
      .string()
      .regex(keyRegex, 'Key must be 2-10 uppercase letters or digits')
      .optional(),
    description: z.string().max(1000).optional().nullable(),
    dueDate: z.coerce.date().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const archiveProjectSchema = z.object({
  archive: z.boolean(),
});
