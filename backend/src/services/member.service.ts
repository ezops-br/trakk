import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, conflict, badRequest } from '../lib/app-error';

// Resolves the authenticated user's role on a project.
// Throws 403 if the user is not a member of the project.
async function getUserProjectRole(userId: string, projectId: string): Promise<Role> {
  const member = await prisma.projectMember.findFirst({
    where: { userId, projectId },
  });
  if (!member) {
    throw forbidden();
  }
  return member.role;
}

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
} as const;

export async function listMembers(requestingUserId: string, projectId: string) {
  await getUserProjectRole(requestingUserId, projectId);

  return prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: { select: USER_SELECT },
    },
    orderBy: { joinedAt: 'asc' },
  });
}

export async function inviteMember(
  requestingUserId: string,
  projectId: string,
  email: string,
  role: 'MEMBER' | 'VIEWER',
) {
  const requesterRole = await getUserProjectRole(requestingUserId, projectId);
  if (requesterRole !== 'OWNER') {
    throw forbidden();
  }

  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    throw notFound('No Trakk account found for this email. They must sign in with Google first.');
  }

  const existing = await prisma.projectMember.findFirst({
    where: { userId: targetUser.id, projectId },
  });
  if (existing) {
    throw conflict('User is already a member of this project');
  }

  return prisma.projectMember.create({
    data: { userId: targetUser.id, projectId, role },
    include: {
      user: { select: USER_SELECT },
    },
  });
}

export async function changeMemberRole(
  requestingUserId: string,
  projectId: string,
  memberId: string,
  newRole: Role,
) {
  const requesterRole = await getUserProjectRole(requestingUserId, projectId);
  if (requesterRole !== 'OWNER') {
    throw forbidden();
  }

  const membership = await prisma.projectMember.findFirst({
    where: { id: memberId },
    include: {
      user: { select: USER_SELECT },
    },
  });
  if (!membership || membership.projectId !== projectId) {
    throw notFound('Member not found');
  }

  if (membership.userId === requestingUserId) {
    throw badRequest('You cannot change your own role. Ask another Owner to do this.');
  }

  if (membership.role === 'OWNER' && newRole !== 'OWNER') {
    const otherOwnerCount = await prisma.projectMember.count({
      where: { projectId, role: 'OWNER', userId: { not: membership.userId } },
    });
    if (otherOwnerCount === 0) {
      throw badRequest(
        'Cannot change role — you are the only owner. Promote another member to Owner first.',
      );
    }
  }

  return prisma.projectMember.update({
    where: { id: memberId },
    data: { role: newRole },
    include: {
      user: { select: USER_SELECT },
    },
  });
}

export async function removeMember(
  requestingUserId: string,
  projectId: string,
  memberId: string,
): Promise<void> {
  const requesterRole = await getUserProjectRole(requestingUserId, projectId);

  const membership = await prisma.projectMember.findFirst({
    where: { id: memberId },
  });
  if (!membership || membership.projectId !== projectId) {
    throw notFound('Member not found');
  }

  if (membership.userId !== requestingUserId && requesterRole !== 'OWNER') {
    throw forbidden();
  }

  if (membership.userId === requestingUserId && requesterRole === 'OWNER') {
    const otherOwnerCount = await prisma.projectMember.count({
      where: { projectId, role: 'OWNER', userId: { not: requestingUserId } },
    });
    if (otherOwnerCount === 0) {
      throw badRequest('Cannot remove the last owner. Promote another member to Owner first.');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticket.updateMany({
      where: { projectId, assigneeId: membership.userId },
      data: { assigneeId: null },
    });
    await tx.projectMember.delete({ where: { id: memberId } });
  });
}
