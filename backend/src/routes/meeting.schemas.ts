import { z } from 'zod';

export const meetingParamsSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().positive(),
  meetingId: z.string().uuid(),
});

export const ticketMeetingParamsSchema = z.object({
  projectId: z.string().uuid(),
  ticketNumber: z.coerce.number().int().positive(),
});

export const listMeetingsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
});

export const scheduleMeetingSchema = z.object({
  title: z.string().trim().min(1).max(255),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendeeEmails: z.array(z.string().email()).max(50).optional(),
});

export const updateMeetingSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
  })
  .refine(data => Object.values(data).some(v => v !== undefined), {
    message: 'At least one field must be provided',
  });
