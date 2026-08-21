import { z } from 'zod';

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['MEMBER', 'VIEWER']),
});

export const changeMemberRoleSchema = z.object({
  role: z.enum(['OWNER', 'MEMBER', 'VIEWER']),
});

export const memberParamsSchema = z.object({
  projectId: z.string().uuid(),
  memberId: z.string().uuid(),
});

export const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});
