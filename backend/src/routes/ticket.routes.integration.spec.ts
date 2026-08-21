// @ts-nocheck
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { AppError } from '../lib/app-error';

// Mock the ticket service (does not exist yet → virtual module) and auth middleware.
jest.mock('../services/ticket.service', () => ({
  listTickets: jest.fn(),
  createTicket: jest.fn(),
  getTicketByNumber: jest.fn(),
  updateTicket: jest.fn(),
  deleteTicket: jest.fn(),
  toggleArchiveTicket: jest.fn(),
  reorderTickets: jest.fn(),
  addLabelToTicket: jest.fn(),
  removeLabelFromTicket: jest.fn(),
}), { virtual: true });
jest.mock('../middleware/auth');

import { ticketRouter } from './ticket.routes';
import * as ticketService from '../services/ticket.service';
import * as authMiddleware from '../middleware/auth';

const mockCreateTicket = ticketService.createTicket as jest.MockedFunction<typeof ticketService.createTicket>;
const mockToggleArchiveTicket = ticketService.toggleArchiveTicket as jest.MockedFunction<
  typeof ticketService.toggleArchiveTicket
>;
const mockRequireAuth = authMiddleware.requireAuth as jest.MockedFunction<typeof authMiddleware.requireAuth>;

const FAKE_USER = { userId: 'user-uuid-1', email: 'alice@example.com' };
const PROJECT_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';
const COLUMN_ID = 'b1c2d3e4-f5a6-789b-cdef-012345678901';
const VALID_SESSION = 'valid.session.token';

const MOCK_TICKET = {
  id: 'ticket-uuid-1',
  projectId: PROJECT_ID,
  number: 1,
  title: 'Fix login bug',
  statusColumnId: COLUMN_ID,
  priority: 'HIGH',
  assignee: null,
  reporter: { id: FAKE_USER.userId },
  labels: [],
};

function buildApp(authenticated = true) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  if (authenticated) {
    mockRequireAuth.mockImplementation((req, _res, next) => {
      req.user = FAKE_USER;
      next();
    });
  } else {
    mockRequireAuth.mockImplementation((_req, _res, next) => {
      next(new AppError(401, 'Unauthorized'));
    });
  }

  app.use('/api/v1/projects', ticketRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/v1/projects/:projectId/tickets', () => {
  it('returns 201 with the created ticket wrapped in a { ticket } envelope', async () => {
    // Arrange
    const app = buildApp();
    mockCreateTicket.mockResolvedValue(MOCK_TICKET as any);

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/tickets`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ title: 'Fix login bug', statusColumnId: COLUMN_ID, priority: 'HIGH' });

    // Assert
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('ticket');
    expect(res.body.ticket).toMatchObject({ number: 1, title: 'Fix login bug' });
  });

  it('returns 401 when no auth cookie is present', async () => {
    // Arrange
    const app = buildApp(false);

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/tickets`)
      .send({ title: 'Fix login bug', statusColumnId: COLUMN_ID });

    // Assert
    expect(res.status).toBe(401);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('returns 400 when the title is missing (validation failure)', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/tickets`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ statusColumnId: COLUMN_ID });

    // Assert
    expect(res.status).toBe(400);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('propagates 403 when the service rejects with forbidden (VIEWER role)', async () => {
    // Arrange
    const app = buildApp();
    mockCreateTicket.mockRejectedValue(new AppError(403, 'Forbidden'));

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/tickets`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ title: 'Fix login bug', statusColumnId: COLUMN_ID, priority: 'HIGH' });

    // Assert
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/projects/:projectId/tickets/:ticketNumber/archive', () => {
  const ARCHIVE_URL = `/api/v1/projects/${PROJECT_ID}/tickets/42/archive`;

  it('returns 200 with the archived ticket wrapped in a { ticket } envelope', async () => {
    // Arrange
    const app = buildApp();
    mockToggleArchiveTicket.mockResolvedValue({
      ...MOCK_TICKET,
      number: 42,
      archivedAt: '2026-08-21T10:00:00.000Z',
    } as any);

    // Act
    const res = await request(app)
      .patch(ARCHIVE_URL)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ archive: true });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ticket');
    expect(res.body.ticket.archivedAt).not.toBeNull();
    expect(mockToggleArchiveTicket).toHaveBeenCalledWith(FAKE_USER.userId, PROJECT_ID, 42, true);
  });

  it('returns 200 and passes archive=false through for a restore', async () => {
    // Arrange
    const app = buildApp();
    mockToggleArchiveTicket.mockResolvedValue({
      ...MOCK_TICKET,
      number: 42,
      archivedAt: null,
    } as any);

    // Act
    const res = await request(app)
      .patch(ARCHIVE_URL)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ archive: false });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body.ticket.archivedAt).toBeNull();
    expect(mockToggleArchiveTicket).toHaveBeenCalledWith(FAKE_USER.userId, PROJECT_ID, 42, false);
  });

  it('returns 401 when no auth cookie is present', async () => {
    // Arrange
    const app = buildApp(false);

    // Act
    const res = await request(app).patch(ARCHIVE_URL).send({ archive: true });

    // Assert
    expect(res.status).toBe(401);
    expect(mockToggleArchiveTicket).not.toHaveBeenCalled();
  });

  it('propagates 403 when the service rejects with forbidden (VIEWER role)', async () => {
    // Arrange
    const app = buildApp();
    mockToggleArchiveTicket.mockRejectedValue(new AppError(403, 'Forbidden'));

    // Act
    const res = await request(app)
      .patch(ARCHIVE_URL)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ archive: true });

    // Assert
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('returns 400 when the archive flag is missing or not a boolean (validation failure)', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const missing = await request(app)
      .patch(ARCHIVE_URL)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({});
    const wrongType = await request(app)
      .patch(ARCHIVE_URL)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ archive: 'yes' });

    // Assert
    expect(missing.status).toBe(400);
    expect(wrongType.status).toBe(400);
    expect(mockToggleArchiveTicket).not.toHaveBeenCalled();
  });

  it('propagates 404 when restoring a ticket that was hard deleted', async () => {
    // Arrange
    const app = buildApp();
    mockToggleArchiveTicket.mockRejectedValue(new AppError(404, 'Ticket not found'));

    // Act
    const res = await request(app)
      .patch(ARCHIVE_URL)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ archive: false });

    // Assert
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Ticket not found' });
  });
});
