import { PrismaClient, Priority, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ── Users ──────────────────────────────────────────────────────────────
  const alice = await prisma.user.upsert({
    where: { email: 'alice@test.com' },
    update: {},
    create: {
      email: 'alice@test.com',
      googleId: 'google-alice-test-123',
      displayName: 'Alice Chen',
      avatarUrl: 'https://api.dicebear.com/8.x/initials/svg?seed=Alice',
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob@test.com' },
    update: {},
    create: {
      email: 'bob@test.com',
      googleId: 'google-bob-test-456',
      displayName: 'Bob Martinez',
      avatarUrl: 'https://api.dicebear.com/8.x/initials/svg?seed=Bob',
    },
  });

  console.log(`Created users: ${alice.email}, ${bob.email}`);

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
    where: { userId_projectId: { userId: alice.id, projectId: project.id } },
    update: {},
    create: { userId: alice.id, projectId: project.id, role: Role.OWNER },
  });

  await prisma.projectMember.upsert({
    where: { userId_projectId: { userId: bob.id, projectId: project.id } },
    update: {},
    create: { userId: bob.id, projectId: project.id, role: Role.MEMBER },
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
        title: 'Set up Google OAuth authentication',
        description: 'Implement Google OAuth 2.0 sign-in flow with JWT session management.',
        statusColumnId: colToDo.id,
        priority: Priority.HIGH,
        assigneeId: alice.id,
        reporterId: alice.id,
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
        assigneeId: bob.id,
        reporterId: alice.id,
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
        assigneeId: alice.id,
        reporterId: bob.id,
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
        assigneeId: bob.id,
        reporterId: alice.id,
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
        assigneeId: alice.id,
        reporterId: alice.id,
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
        authorId: bob.id,
        body: 'Should we use OAuth 2.0 or email/password auth for this?',
      },
      {
        ticketId: t1.id,
        authorId: alice.id,
        body: 'Google OAuth 2.0 only — no passwords. See the architecture doc for the full flow.',
      },
      {
        ticketId: t3.id,
        authorId: bob.id,
        body: 'Remember to add Zod validation on the backend endpoint too, not just the form.',
      },
    ],
  });

  console.log('Created comments');
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
