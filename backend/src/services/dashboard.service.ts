import { prisma } from '../lib/prisma';

export interface UserTicketSummary {
  id: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  number: number;
  title: string;
  priority: string;
  statusColumnName: string;
  assigneeId: string | null;
  updatedAt: string;
}

export interface UserActivitySummary {
  id: string;
  ticketId: string;
  ticketNumber: number;
  projectId: string;
  projectKey: string;
  action: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface UserProjectSummary {
  id: string;
  name: string;
  key: string;
  role: string;
  openCount: number;
  totalCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserMeetingSummary {
  id: string;
  ticketId: string;
  ticketNumber: number;
  projectId: string;
  projectKey: string;
  title: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  organizerId: string;
  organizerName: string;
  organizerAvatarUrl: string | null;
}

export interface DashboardData {
  tickets: unknown[];
  activities: unknown[];
  projects: UserProjectSummary[];
  meetings: unknown[];
}

export async function getDashboardData(userId: string): Promise<DashboardData> {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true, role: true },
  });

  if (memberships.length === 0) {
    return { tickets: [], activities: [], projects: [], meetings: [] };
  }

  const projectIds = memberships.map((m) => m.projectId);

  const [tickets, activities, rawProjects, meetings] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: userId,
        archivedAt: null,
        project: { archivedAt: null },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        projectId: true,
        number: true,
        title: true,
        priority: true,
        assigneeId: true,
        updatedAt: true,
        statusColumn: { select: { name: true } },
        project: { select: { key: true, name: true } },
      },
    }),

    prisma.activityLog.findMany({
      where: {
        ticket: {
          projectId: { in: projectIds },
          archivedAt: null,
          project: { archivedAt: null },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        userId: true,
        createdAt: true,
        user: { select: { displayName: true } },
        ticket: {
          select: {
            id: true,
            number: true,
            projectId: true,
            project: { select: { key: true } },
          },
        },
      },
    }),

    prisma.project.findMany({
      where: { id: { in: projectIds }, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: {
        // Archived tickets must not inflate openCount/totalCount on the cards.
        tickets: { where: { archivedAt: null }, select: { id: true, statusColumnId: true } },
        columns: { select: { id: true, position: true }, orderBy: { position: 'desc' } },
      },
    }),

    prisma.meeting.findMany({
      where: {
        ticket: {
          projectId: { in: projectIds },
          archivedAt: null,
          project: { archivedAt: null },
        },
        startTime: { gt: new Date() },
      },
      orderBy: { startTime: 'asc' },
      take: 10,
      select: {
        id: true,
        ticketId: true,
        title: true,
        startTime: true,
        endTime: true,
        meetLink: true,
        organizerId: true,
        organizer: { select: { displayName: true, avatarUrl: true } },
        ticket: {
          select: {
            number: true,
            projectId: true,
            project: { select: { key: true } },
          },
        },
      },
    }),
  ]);

  // Map raw project rows to computed summaries.
  // columns is ordered by position desc, so columns[0] is the last (Done) column.
  const projects: UserProjectSummary[] = rawProjects.map((project) => {
    const lastColumnId = project.columns[0]?.id;
    const openCount = project.tickets.filter((t) => t.statusColumnId !== lastColumnId).length;
    const totalCount = project.tickets.length;
    const role = memberships.find((m) => m.projectId === project.id)?.role ?? 'MEMBER';
    return {
      id: project.id,
      name: project.name,
      key: project.key,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      openCount,
      totalCount,
      role,
    };
  });

  return { tickets, activities, projects, meetings };
}
