import type { Priority, TicketTemplate } from '@prisma/client';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { broadcast } from '../lib/event-broadcaster';
import { badRequest, conflict, forbidden, notFound } from '../lib/app-error';

type CreateInput = {
  name: string;
  titleTemplate?: string;
  descriptionTemplate?: string;
  defaultPriority?: Priority;
  defaultLabelIds?: string[];
};

type UpdateInput = {
  name?: string;
  titleTemplate?: string;
  descriptionTemplate?: string;
  defaultPriority?: Priority | null;
  defaultLabelIds?: string[];
};

export type TemplateWithLabels = Omit<TicketTemplate, 'defaultLabelIds'> & {
  defaultLabelIds: string[];
  defaultLabels: Array<{ id: string; name: string; color: string }>;
};

async function getUserProjectRole(
  userId: string,
  projectId: string,
): Promise<Role | null> {
  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  return membership?.role ?? null;
}

async function assertProjectNotArchived(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { archivedAt: true },
  });
  if (!project) {
    throw notFound('Project not found');
  }
  if (project.archivedAt) {
    throw badRequest('Project is archived');
  }
}

async function filterValidLabelIds(
  projectId: string,
  labelIds: string[],
): Promise<string[]> {
  if (labelIds.length === 0) {
    return [];
  }
  const labels = await prisma.label.findMany({
    where: { id: { in: labelIds }, projectId },
    select: { id: true },
  });
  const valid = new Set(labels.map((l) => l.id));
  return labelIds.filter((id) => valid.has(id));
}

async function hydrateDefaultLabels(
  projectId: string,
  templates: TicketTemplate[],
): Promise<TemplateWithLabels[]> {
  const allLabelIds = new Set<string>();
  for (const t of templates) {
    for (const id of t.defaultLabelIds) {
      allLabelIds.add(id);
    }
  }
  const labels =
    allLabelIds.size === 0
      ? []
      : await prisma.label.findMany({
          where: { id: { in: Array.from(allLabelIds) }, projectId },
          select: { id: true, name: true, color: true },
        });
  const byId = new Map(labels.map((l) => [l.id, l]));
  return templates.map((t) => {
    const validIds = t.defaultLabelIds.filter((id) => byId.has(id));
    return {
      ...t,
      defaultLabelIds: validIds,
      defaultLabels: validIds.map((id) => {
        const l = byId.get(id)!;
        return { id: l.id, name: l.name, color: l.color };
      }),
    };
  });
}

export async function listTemplates(
  userId: string,
  projectId: string,
): Promise<{ templates: TemplateWithLabels[] }> {
  const role = await getUserProjectRole(userId, projectId);
  if (!role) {
    throw forbidden('Not a member of this project');
  }
  const rows = await prisma.ticketTemplate.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
  });
  const templates = await hydrateDefaultLabels(projectId, rows);
  return { templates };
}

export async function createTemplate(
  userId: string,
  projectId: string,
  input: CreateInput,
): Promise<{ template: TemplateWithLabels }> {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== Role.OWNER) {
    throw forbidden('Only OWNER can manage templates');
  }
  await assertProjectNotArchived(projectId);

  const duplicate = await prisma.ticketTemplate.findFirst({
    where: {
      projectId,
      name: { equals: input.name, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (duplicate) {
    throw conflict('A template with this name already exists in this project');
  }

  const validLabelIds = await filterValidLabelIds(
    projectId,
    input.defaultLabelIds ?? [],
  );

  const created = await prisma.ticketTemplate.create({
    data: {
      projectId,
      name: input.name,
      titleTemplate: input.titleTemplate ?? null,
      descriptionTemplate: input.descriptionTemplate ?? null,
      defaultPriority: input.defaultPriority ?? null,
      defaultLabelIds: validLabelIds,
    },
  });

  const [hydrated] = await hydrateDefaultLabels(projectId, [created]);
  broadcast(projectId, 'ticketTemplate.created', { template: hydrated });
  return { template: hydrated! };
}

export async function updateTemplate(
  userId: string,
  projectId: string,
  templateId: string,
  input: UpdateInput,
): Promise<{ template: TemplateWithLabels }> {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== Role.OWNER) {
    throw forbidden('Only OWNER can manage templates');
  }

  const existing = await prisma.ticketTemplate.findUnique({
    where: { id: templateId },
  });
  if (!existing || existing.projectId !== projectId) {
    throw notFound('Template not found');
  }

  if (input.name !== undefined && input.name.toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = await prisma.ticketTemplate.findFirst({
      where: {
        projectId,
        id: { not: templateId },
        name: { equals: input.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw conflict('A template with this name already exists in this project');
    }
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.titleTemplate !== undefined) data.titleTemplate = input.titleTemplate;
  if (input.descriptionTemplate !== undefined)
    data.descriptionTemplate = input.descriptionTemplate;
  if (input.defaultPriority !== undefined) data.defaultPriority = input.defaultPriority;
  if (input.defaultLabelIds !== undefined) {
    data.defaultLabelIds = await filterValidLabelIds(projectId, input.defaultLabelIds);
  }

  const updated = await prisma.ticketTemplate.update({
    where: { id: templateId },
    data,
  });

  const [hydrated] = await hydrateDefaultLabels(projectId, [updated]);
  broadcast(projectId, 'ticketTemplate.updated', { template: hydrated });
  return { template: hydrated! };
}

export async function deleteTemplate(
  userId: string,
  projectId: string,
  templateId: string,
): Promise<void> {
  const role = await getUserProjectRole(userId, projectId);
  if (role !== Role.OWNER) {
    throw forbidden('Only OWNER can manage templates');
  }

  const existing = await prisma.ticketTemplate.findUnique({
    where: { id: templateId },
  });
  if (!existing || existing.projectId !== projectId) {
    throw notFound('Template not found');
  }

  await prisma.ticketTemplate.delete({ where: { id: templateId } });
  broadcast(projectId, 'ticketTemplate.deleted', { templateId });
}
