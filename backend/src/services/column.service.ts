import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, badRequest } from '../lib/app-error';
import { broadcast } from '../lib/event-broadcaster';

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

export async function listColumns(userId: string, projectId: string) {
  await getUserProjectRole(userId, projectId);

  return prisma.statusColumn.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
  });
}

export async function createColumn(userId: string, projectId: string, name: string) {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  const max = await prisma.statusColumn.aggregate({
    where: { projectId },
    _max: { position: true },
  });
  const position = (max._max.position ?? 0) + 1;

  const column = await prisma.statusColumn.create({
    data: { projectId, name, position },
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'column.created', { column });

  return column;
}

export async function updateColumn(
  userId: string,
  projectId: string,
  columnId: string,
  input: { name?: string; position?: number },
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER') {
    throw forbidden();
  }
  if (input.name === undefined && input.position === undefined) {
    throw badRequest('At least one field required');
  }
  await assertProjectNotArchived(projectId);

  const existing = await prisma.statusColumn.findFirst({
    where: { id: columnId },
  });
  if (!existing || existing.projectId !== projectId) {
    throw notFound('Column not found');
  }

  // Simple field update (name only, or no repositioning).
  if (input.position === undefined || input.position === existing.position) {
    const column = await prisma.statusColumn.update({
      where: { id: columnId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
    });
    // NOTE: broadcast is in-memory — single-instance only
    broadcast(projectId, 'column.updated', { column });
    return column;
  }

  // Repositioning: shift siblings atomically so positions stay contiguous.
  const from = existing.position;
  const to = input.position;

  const column = await prisma.$transaction(async (tx) => {
    if (to < from) {
      // Moving up: shift the [to, from) range down by 1.
      await tx.statusColumn.updateMany({
        where: {
          projectId,
          id: { not: columnId },
          position: { gte: to, lt: from },
        },
        data: { position: { increment: 1 } },
      });
    } else {
      // Moving down: shift the (from, to] range up by 1.
      await tx.statusColumn.updateMany({
        where: {
          projectId,
          id: { not: columnId },
          position: { gt: from, lte: to },
        },
        data: { position: { decrement: 1 } },
      });
    }

    return tx.statusColumn.update({
      where: { id: columnId },
      data: {
        position: to,
        ...(input.name !== undefined ? { name: input.name } : {}),
      },
    });
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'column.updated', { column });

  return column;
}

export async function deleteColumn(
  userId: string,
  projectId: string,
  columnId: string,
  migrationTargetColumnId: string,
): Promise<void> {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER') {
    throw forbidden();
  }
  await assertProjectNotArchived(projectId);

  const column = await prisma.statusColumn.findFirst({
    where: { id: columnId },
  });
  if (!column || column.projectId !== projectId) {
    throw notFound('Column not found');
  }

  const target = await prisma.statusColumn.findFirst({
    where: { id: migrationTargetColumnId },
  });
  if (!target || target.projectId !== projectId) {
    throw badRequest('Migration target column does not belong to this project');
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticket.updateMany({
      where: { statusColumnId: columnId },
      data: { statusColumnId: migrationTargetColumnId },
    });
    await tx.statusColumn.delete({ where: { id: columnId } });
  });

  // NOTE: broadcast is in-memory — single-instance only
  broadcast(projectId, 'column.deleted', { columnId, migrationTargetColumnId });
}
