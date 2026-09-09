import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, notFound, conflict } from '../lib/app-error';

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

export async function listProjectsByUser(userId: string) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId, project: { archivedAt: null } },
    include: {
      project: {
        include: { _count: { select: { members: true } } },
      },
    },
  });

  return memberships
    .map((member) => {
      const { _count, ...project } = member.project;
      return {
        ...project,
        role: member.role,
        memberCount: _count.members,
      };
    });
}

export async function getProjectById(projectId: string, userId: string) {
  const role = await getUserProjectRole(userId, projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { _count: { select: { members: true } } },
  });
  if (!project) {
    throw notFound();
  }

  const { _count, ...rest } = project;
  return { ...rest, role, memberCount: _count.members };
}

export async function createProject(
  data: { name: string; key: string; description?: string | null; dueDate?: Date | null },
  userId: string,
) {
  try {
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: data.name,
          key: data.key,
          description: data.description ?? null,
          dueDate: data.dueDate ?? null,
        },
      });

      await tx.projectMember.create({
        data: {
          userId,
          projectId: created.id,
          role: 'OWNER',
        },
      });

      await tx.statusColumn.createMany({
        data: [
          { projectId: created.id, name: 'backlog', position: 0 },
          { projectId: created.id, name: 'todo', position: 1 },
          { projectId: created.id, name: 'in_progress', position: 2 },
          { projectId: created.id, name: 'review', position: 3 },
          { projectId: created.id, name: 'done', position: 4 },
        ],
      });

      return created;
    });

    return { ...project, role: 'OWNER' as Role, memberCount: 1 };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('Project key already exists', `The key "${data.key}" is already in use.`);
    }
    throw err;
  }
}

export async function updateProject(
  projectId: string,
  userId: string,
  fields: { name?: string; key?: string; description?: string | null; dueDate?: Date | null },
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER') {
    throw forbidden();
  }

  const data: Prisma.ProjectUpdateInput = {};
  if (fields.name !== undefined) {
    data.name = fields.name;
  }
  if (fields.key !== undefined) {
    data.key = fields.key;
  }
  if (fields.description !== undefined) {
    data.description = fields.description;
  }
  if (fields.dueDate !== undefined) {
    data.dueDate = fields.dueDate;
  }

  try {
    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
    });
    return { ...updated, role };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw conflict('Project key already exists', `The key "${fields.key}" is already in use.`);
      }
      if (err.code === 'P2025') {
        throw notFound();
      }
    }
    throw err;
  }
}

export async function deleteProject(projectId: string, userId: string): Promise<void> {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER') {
    throw forbidden();
  }

  await prisma.project.delete({ where: { id: projectId } });
}

export async function toggleArchiveProject(
  projectId: string,
  userId: string,
  archive: boolean,
) {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== 'OWNER') {
    throw forbidden();
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { archivedAt: archive ? new Date() : null },
  });

  return { ...updated, role };
}
