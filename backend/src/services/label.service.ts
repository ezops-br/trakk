import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, badRequest, conflict } from '../lib/app-error';
import { broadcast } from '../lib/event-broadcaster';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

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

// Throws 400 if the project is archived (mutations are blocked on archived projects).
async function assertProjectNotArchived(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, archivedAt: true },
  });
  if (!project) {
    throw notFound();
  }
  if (project.archivedAt !== null) {
    throw badRequest('Cannot modify an archived project');
  }
}

export async function listLabels(userId: string, projectId: string) {
  await getUserProjectRole(userId, projectId);

  return prisma.label.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
  });
}

export async function createLabel(
  userId: string,
  projectId: string,
  input: { name: string; color: string },
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER') {
    throw forbidden();
  }
  if (!HEX_COLOR.test(input.color)) {
    throw badRequest('Color must be a hex color e.g. #FF0000');
  }
  await assertProjectNotArchived(projectId);

  const duplicate = await prisma.label.findFirst({
    where: { projectId, name: { equals: input.name, mode: 'insensitive' } },
  });
  if (duplicate) {
    throw conflict('A label with this name already exists in this project');
  }

  const label = await prisma.label.create({
    data: { projectId, name: input.name, color: input.color },
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'label.created', { label });

  return label;
}

export async function updateLabel(
  userId: string,
  projectId: string,
  labelId: string,
  input: { name?: string; color?: string },
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER') {
    throw forbidden();
  }
  if (input.name === undefined && input.color === undefined) {
    throw badRequest('At least one field required');
  }
  if (input.color !== undefined && !HEX_COLOR.test(input.color)) {
    throw badRequest('Color must be a hex color e.g. #FF0000');
  }
  await assertProjectNotArchived(projectId);

  const existing = await prisma.label.findFirst({ where: { id: labelId } });
  if (!existing || existing.projectId !== projectId) {
    throw notFound('Label not found');
  }

  if (input.name !== undefined) {
    const duplicate = await prisma.label.findFirst({
      where: {
        projectId,
        name: { equals: input.name, mode: 'insensitive' },
        id: { not: labelId },
      },
    });
    if (duplicate) {
      throw conflict('A label with this name already exists in this project');
    }
  }

  const label = await prisma.label.update({
    where: { id: labelId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'label.updated', { label });

  return label;
}

export async function deleteLabel(
  userId: string,
  projectId: string,
  labelId: string,
): Promise<void> {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  const existing = await prisma.label.findFirst({ where: { id: labelId } });
  if (!existing || existing.projectId !== projectId) {
    throw notFound('Label not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticketLabel.deleteMany({ where: { labelId } });
    await tx.label.delete({ where: { id: labelId } });
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'label.deleted', { labelId });
}
