// @ts-nocheck
import { Role, Priority } from '@prisma/client';

jest.mock('../lib/prisma', () => ({
  prisma: {
    projectMember: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    label: { findMany: jest.fn() },
    ticketTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('../lib/event-broadcaster', () => ({
  broadcast: jest.fn(),
}));

import { prisma } from '../lib/prisma';
import { broadcast } from '../lib/event-broadcaster';
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listTemplates,
} from './ticket-template.service';

const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_USER_ID = '22222222-2222-2222-2222-222222222222';
const PROJECT_ID = '33333333-3333-3333-3333-333333333333';
const TEMPLATE_ID = '44444444-4444-4444-4444-444444444444';

const OWNER_MEMBERSHIP = { role: Role.OWNER };
const MEMBER_MEMBERSHIP = { role: Role.MEMBER };
const ACTIVE_PROJECT = { archivedAt: null };
const ARCHIVED_PROJECT = { archivedAt: new Date('2026-01-01') };

const mockDateNow = () => new Date('2026-07-01T00:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  // Drain per-method mockResolvedValueOnce queues from previous tests.
  prisma.projectMember.findUnique.mockReset();
  prisma.project.findUnique.mockReset();
  prisma.label.findMany.mockReset();
  prisma.ticketTemplate.findFirst.mockReset();
  prisma.ticketTemplate.findMany.mockReset();
  prisma.ticketTemplate.findUnique.mockReset();
  prisma.ticketTemplate.create.mockReset();
  prisma.ticketTemplate.update.mockReset();
  prisma.ticketTemplate.delete.mockReset();
  (broadcast as jest.Mock).mockReset();
});

describe('createTemplate', () => {
  it('rejects non-OWNER with forbidden', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    await expect(
      createTemplate(MEMBER_USER_ID, PROJECT_ID, { name: 'Bug Triage' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects archived project with 400', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.project.findUnique as jest.Mock).mockResolvedValueOnce(ARCHIVED_PROJECT);
    await expect(
      createTemplate(OWNER_USER_ID, PROJECT_ID, { name: 'Bug Triage' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects case-insensitive duplicate name with 409', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.project.findUnique as jest.Mock).mockResolvedValueOnce(ACTIVE_PROJECT);
    (prisma.ticketTemplate.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'existing' });
    await expect(
      createTemplate(OWNER_USER_ID, PROJECT_ID, { name: 'Bug Triage' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('silently drops stale defaultLabelIds and creates template', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.project.findUnique as jest.Mock).mockResolvedValueOnce(ACTIVE_PROJECT);
    (prisma.ticketTemplate.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.label.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'label-keep-1' },
      { id: 'label-keep-2' },
    ]);
    const created = {
      id: TEMPLATE_ID,
      projectId: PROJECT_ID,
      name: 'Bug Triage',
      titleTemplate: null,
      descriptionTemplate: null,
      defaultPriority: null,
      defaultLabelIds: ['label-keep-1', 'label-keep-2'],
      createdAt: mockDateNow(),
      updatedAt: mockDateNow(),
    };
    (prisma.ticketTemplate.create as jest.Mock).mockResolvedValueOnce(created);
    (prisma.label.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'label-keep-1', name: 'Bug', color: '#ff0000' },
      { id: 'label-keep-2', name: 'Urgent', color: '#00ff00' },
    ]);

    const result = await createTemplate(OWNER_USER_ID, PROJECT_ID, {
      name: 'Bug Triage',
      defaultLabelIds: ['label-keep-1', 'label-stale', 'label-keep-2'],
    });

    expect(prisma.ticketTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        defaultLabelIds: ['label-keep-1', 'label-keep-2'],
      }),
    });
    expect(result.template.defaultLabelIds).toEqual(['label-keep-1', 'label-keep-2']);
    expect(result.template.defaultLabels).toEqual([
      { id: 'label-keep-1', name: 'Bug', color: '#ff0000' },
      { id: 'label-keep-2', name: 'Urgent', color: '#00ff00' },
    ]);
    expect(broadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'ticketTemplate.created',
      expect.objectContaining({ template: expect.any(Object) }),
    );
  });

  it('succeeds and broadcasts on happy path', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.project.findUnique as jest.Mock).mockResolvedValueOnce(ACTIVE_PROJECT);
    (prisma.ticketTemplate.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.label.findMany as jest.Mock).mockResolvedValueOnce([]);
    const created = {
      id: TEMPLATE_ID,
      projectId: PROJECT_ID,
      name: 'Bug Triage',
      titleTemplate: null,
      descriptionTemplate: null,
      defaultPriority: Priority.HIGH,
      defaultLabelIds: [],
      createdAt: mockDateNow(),
      updatedAt: mockDateNow(),
    };
    (prisma.ticketTemplate.create as jest.Mock).mockResolvedValueOnce(created);
    (prisma.label.findMany as jest.Mock).mockResolvedValueOnce([]);

    const result = await createTemplate(OWNER_USER_ID, PROJECT_ID, {
      name: 'Bug Triage',
      defaultPriority: Priority.HIGH,
    });

    expect(result.template.defaultPriority).toBe(Priority.HIGH);
    expect(broadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'ticketTemplate.created',
      expect.any(Object),
    );
  });
});

describe('updateTemplate', () => {
  it('re-validates defaultLabelIds against current project labels', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.ticketTemplate.findUnique as jest.Mock).mockResolvedValueOnce({
      id: TEMPLATE_ID,
      projectId: PROJECT_ID,
      name: 'Bug Triage',
      defaultLabelIds: ['label-keep-1'],
    });
    (prisma.label.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'label-keep-1' },
    ]);
    const updated = {
      id: TEMPLATE_ID,
      projectId: PROJECT_ID,
      name: 'Bug Triage',
      titleTemplate: null,
      descriptionTemplate: null,
      defaultPriority: null,
      defaultLabelIds: ['label-keep-1'],
      createdAt: mockDateNow(),
      updatedAt: mockDateNow(),
    };
    (prisma.ticketTemplate.update as jest.Mock).mockResolvedValueOnce(updated);
    (prisma.label.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'label-keep-1', name: 'Bug', color: '#ff0000' },
    ]);

    await updateTemplate(OWNER_USER_ID, PROJECT_ID, TEMPLATE_ID, {
      defaultLabelIds: ['label-keep-1', 'label-stale'],
    });

    expect(prisma.ticketTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: expect.objectContaining({
        defaultLabelIds: ['label-keep-1'],
      }),
    });
  });

  it('rejects name collision excluding self with 409', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.ticketTemplate.findUnique as jest.Mock).mockResolvedValueOnce({
      id: TEMPLATE_ID,
      projectId: PROJECT_ID,
      name: 'Old Name',
      defaultLabelIds: [],
    });
    (prisma.ticketTemplate.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'other' });

    await expect(
      updateTemplate(OWNER_USER_ID, PROJECT_ID, TEMPLATE_ID, { name: 'New Name' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows updating to same name without conflict', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.ticketTemplate.findUnique as jest.Mock).mockResolvedValueOnce({
      id: TEMPLATE_ID,
      projectId: PROJECT_ID,
      name: 'Bug Triage',
      defaultLabelIds: [],
    });
    const updated = {
      id: TEMPLATE_ID,
      projectId: PROJECT_ID,
      name: 'bug triage',
      titleTemplate: null,
      descriptionTemplate: null,
      defaultPriority: null,
      defaultLabelIds: [],
      createdAt: mockDateNow(),
      updatedAt: mockDateNow(),
    };
    (prisma.ticketTemplate.update as jest.Mock).mockResolvedValueOnce(updated);
    (prisma.label.findMany as jest.Mock).mockResolvedValueOnce([]);

    await expect(
      updateTemplate(OWNER_USER_ID, PROJECT_ID, TEMPLATE_ID, { name: 'bug triage' }),
    ).resolves.toBeDefined();
    expect(prisma.ticketTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('rejects non-OWNER with forbidden', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(MEMBER_MEMBERSHIP);
    await expect(
      updateTemplate(MEMBER_USER_ID, PROJECT_ID, TEMPLATE_ID, { name: 'X' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('deleteTemplate', () => {
  it('returns 404 if template does not belong to project', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.ticketTemplate.findUnique as jest.Mock).mockResolvedValueOnce({
      id: TEMPLATE_ID,
      projectId: 'other-project-id',
      name: 'X',
      defaultLabelIds: [],
    });

    await expect(
      deleteTemplate(OWNER_USER_ID, PROJECT_ID, TEMPLATE_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.ticketTemplate.delete).not.toHaveBeenCalled();
  });

  it('returns 404 if template does not exist', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.ticketTemplate.findUnique as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      deleteTemplate(OWNER_USER_ID, PROJECT_ID, TEMPLATE_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deletes and broadcasts on happy path', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.ticketTemplate.findUnique as jest.Mock).mockResolvedValueOnce({
      id: TEMPLATE_ID,
      projectId: PROJECT_ID,
      name: 'X',
      defaultLabelIds: [],
    });
    (prisma.ticketTemplate.delete as jest.Mock).mockResolvedValueOnce(undefined);

    await deleteTemplate(OWNER_USER_ID, PROJECT_ID, TEMPLATE_ID);

    expect(prisma.ticketTemplate.delete).toHaveBeenCalledWith({ where: { id: TEMPLATE_ID } });
    expect(broadcast).toHaveBeenCalledWith(
      PROJECT_ID,
      'ticketTemplate.deleted',
      { templateId: TEMPLATE_ID },
    );
  });
});

describe('listTemplates', () => {
  it('returns hydrated templates ordered by name', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(OWNER_MEMBERSHIP);
    (prisma.ticketTemplate.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: TEMPLATE_ID,
        projectId: PROJECT_ID,
        name: 'Bug',
        titleTemplate: null,
        descriptionTemplate: null,
        defaultPriority: null,
        defaultLabelIds: ['label-1'],
        createdAt: mockDateNow(),
        updatedAt: mockDateNow(),
      },
    ]);
    (prisma.label.findMany as jest.Mock).mockResolvedValueOnce([
      { id: 'label-1', name: 'Bug', color: '#ff0000' },
    ]);

    const result = await listTemplates(OWNER_USER_ID, PROJECT_ID);

    expect(result.templates).toHaveLength(1);
    expect(result.templates[0]!.defaultLabels).toEqual([
      { id: 'label-1', name: 'Bug', color: '#ff0000' },
    ]);
    expect(prisma.ticketTemplate.findMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      orderBy: { name: 'asc' },
    });
  });

  it('rejects non-member with forbidden', async () => {
    (prisma.projectMember.findUnique as jest.Mock).mockResolvedValueOnce(null);
    await expect(listTemplates(MEMBER_USER_ID, PROJECT_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});