import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as memberService from '../services/member.service';
import {
  inviteMemberSchema,
  changeMemberRoleSchema,
  memberParamsSchema,
  projectParamsSchema,
} from './member.schemas';

export const memberRouter = Router();

memberRouter.use(requireAuth);

// GET /:projectId/members — list all members of a project
memberRouter.get(
  '/:projectId/members',
  validate(projectParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      const members = await memberService.listMembers(
        req.user!.userId,
        req.params.projectId,
      );
      res.json({ members });
    } catch (error) {
      next(error);
    }
  },
);

// POST /:projectId/members — invite a new member (OWNER only)
memberRouter.post(
  '/:projectId/members',
  validate(projectParamsSchema, 'params'),
  validate(inviteMemberSchema),
  async (req, res, next) => {
    try {
      const member = await memberService.inviteMember(
        req.user!.userId,
        req.params.projectId,
        req.body.email,
        req.body.role,
      );
      res.status(201).json({ member });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /:projectId/members/:memberId — change a member's role (OWNER only)
memberRouter.patch(
  '/:projectId/members/:memberId',
  validate(memberParamsSchema, 'params'),
  validate(changeMemberRoleSchema),
  async (req, res, next) => {
    try {
      const member = await memberService.changeMemberRole(
        req.user!.userId,
        req.params.projectId,
        req.params.memberId,
        req.body.role,
      );
      res.json({ member });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /:projectId/members/:memberId — remove a member or leave a project
memberRouter.delete(
  '/:projectId/members/:memberId',
  validate(memberParamsSchema, 'params'),
  async (req, res, next) => {
    try {
      await memberService.removeMember(
        req.user!.userId,
        req.params.projectId,
        req.params.memberId,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
