import { PrismaClient, Priority, Role } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Users ──────────────────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'admin@trakk.local' },
    update: {},
    create: {
      email: 'admin@trakk.local',
      passwordHash: await hashPassword('admin123'),
      displayName: 'Admin',
      avatarUrl: 'https://api.dicebear.com/8.x/initials/svg?seed=Admin',
    },
  });

  console.log(`Created user: ${admin.email}`);

  // ── Project ────────────────────────────────────────────────────────────
  const project = await prisma.project.upsert({
    where: { key: 'DEMO' },
    update: {},
    create: {
      name: 'Demo Project',
      key: 'DEMO',
      description: 'A demo project to showcase Trakk features.',
    },
  });

  console.log(`Created project: ${project.key}`);

  // ── Members ────────────────────────────────────────────────────────────
  await prisma.projectMember.upsert({
    where: { userId_projectId: { userId: admin.id, projectId: project.id } },
    update: {},
    create: { userId: admin.id, projectId: project.id, role: Role.OWNER },
  });

  console.log('Added project members');

  // ── Status Columns ─────────────────────────────────────────────────────
  const [colToDo, colInProgress, colInReview, colDone] = await Promise.all([
    prisma.statusColumn.create({
      data: { projectId: project.id, name: 'To Do', position: 0 },
    }),
    prisma.statusColumn.create({
      data: { projectId: project.id, name: 'In Progress', position: 1 },
    }),
    prisma.statusColumn.create({
      data: { projectId: project.id, name: 'In Review', position: 2 },
    }),
    prisma.statusColumn.create({
      data: { projectId: project.id, name: 'Done', position: 3 },
    }),
  ]);

  console.log('Created status columns');

  // ── Labels ─────────────────────────────────────────────────────────────
  const [labelBug, labelEnhancement] = await Promise.all([
    prisma.label.create({
      data: { projectId: project.id, name: 'Bug', color: '#FF4757' },
    }),
    prisma.label.create({
      data: { projectId: project.id, name: 'Enhancement', color: '#47B8E0' },
    }),
  ]);

  console.log('Created labels');

  // ── Tickets ────────────────────────────────────────────────────────────
  const [t1, t2, t3, t4, t5] = await Promise.all([
    prisma.ticket.create({
      data: {
        projectId: project.id,
        number: 1,
        title: 'Set up email/password authentication',
        description: 'Implement email/password sign-in with JWT session management.',
        statusColumnId: colToDo.id,
        priority: Priority.HIGH,
        assigneeId: admin.id,
        reporterId: admin.id,
        sortOrder: 1000,
      },
    }),
    prisma.ticket.create({
      data: {
        projectId: project.id,
        number: 2,
        title: 'Design Kanban board layout',
        description: 'Create the drag-and-drop Kanban board with status columns and ticket cards.',
        statusColumnId: colToDo.id,
        priority: Priority.MEDIUM,
        assigneeId: admin.id,
        reporterId: admin.id,
        sortOrder: 2000,
      },
    }),
    prisma.ticket.create({
      data: {
        projectId: project.id,
        number: 3,
        title: 'Implement ticket creation form',
        description: 'Build the ticket creation dialog with title, description (Markdown), priority, and assignee fields.',
        statusColumnId: colInProgress.id,
        priority: Priority.HIGH,
        assigneeId: admin.id,
        reporterId: admin.id,
        sortOrder: 1000,
      },
    }),
    prisma.ticket.create({
      data: {
        projectId: project.id,
        number: 4,
        title: 'Add comment threading on tickets',
        description: 'Comments support Markdown. Include an activity log alongside the comment thread.',
        statusColumnId: colInReview.id,
        priority: Priority.MEDIUM,
        assigneeId: admin.id,
        reporterId: admin.id,
        sortOrder: 1000,
      },
    }),
    prisma.ticket.create({
      data: {
        projectId: project.id,
        number: 5,
        title: 'Set up Docker Compose stack',
        description: 'Configure Docker Compose for local development with hot-reload for backend and frontend.',
        statusColumnId: colDone.id,
        priority: Priority.LOW,
        assigneeId: admin.id,
        reporterId: admin.id,
        sortOrder: 1000,
      },
    }),
  ]);

  console.log('Created tickets');

  // ── Ticket Labels ──────────────────────────────────────────────────────
  await Promise.all([
    prisma.ticketLabel.create({
      data: { ticketId: t2.id, labelId: labelEnhancement.id },
    }),
    prisma.ticketLabel.create({
      data: { ticketId: t4.id, labelId: labelBug.id },
    }),
  ]);

  console.log('Attached labels to tickets');

  // ── Comments ───────────────────────────────────────────────────────────
  await prisma.comment.createMany({
    data: [
      {
        ticketId: t1.id,
        authorId: admin.id,
        body: 'Email/password only for now — no OAuth. See the architecture doc for the full flow.',
      },
      {
        ticketId: t3.id,
        authorId: admin.id,
        body: 'Remember to add Zod validation on the backend endpoint too, not just the form.',
      },
    ],
  });

  console.log('Created comments');
  console.log('Seed complete.');
  console.log('Demo login: admin@trakk.local / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
