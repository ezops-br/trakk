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
  getDeletionImpact: jest.fn(),
  reorderTickets: jest.fn(),
  addLabelToTicket: jest.fn(),
  removeLabelFromTicket: jest.fn(),
  bulkUpdate: jest.fn(),
}), { virtual: true });
jest.mock('../middleware/auth');

import { ticketRouter } from './ticket.routes';
import * as ticketService from '../services/ticket.service';
import * as authMiddleware from '../middleware/auth';

const mockCreateTicket = ticketService.createTicket as jest.MockedFunction<typeof ticketService.createTicket>;
const mockDeleteTicket = ticketService.deleteTicket as jest.MockedFunction<typeof ticketService.deleteTicket>;
const mockGetDeletionImpact = ticketService.getDeletionImpact as jest.MockedFunction<typeof ticketService.getDeletionImpact>;
const mockGetTicketByNumber = ticketService.getTicketByNumber as jest.MockedFunction<typeof ticketService.getTicketByNumber>;
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

  it('returns 201 with dueDate echoed when dueDate is provided on create', async () => {
    // Arrange
    const app = buildApp();
    const dueDate = '2024-08-15T00:00:00.000Z';
    const ticketWithDueDate = { ...MOCK_TICKET, dueDate };
    mockCreateTicket.mockResolvedValue(ticketWithDueDate as any);

    // Act
    const res = await request(app)
      .post(`/api/v1/projects/${PROJECT_ID}/tickets`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ title: 'Fix login bug', statusColumnId: COLUMN_ID, priority: 'HIGH', dueDate });

    // Assert
    expect(res.status).toBe(201);
    expect(res.body.ticket.dueDate).toBe(dueDate);
    expect(mockCreateTicket).toHaveBeenCalledWith(
      FAKE_USER.userId,
      PROJECT_ID,
      expect.objectContaining({ dueDate }),
    );
  });
});

describe('GET /api/v1/projects/:projectId/tickets', () => {
  const mockListTickets = ticketService.listTickets as jest.MockedFunction<typeof ticketService.listTickets>;

  it('accepts sort=priority&order=desc and forwards them to the service', async () => {
    // Arrange
    const app = buildApp();
    mockListTickets.mockResolvedValue({ tickets: [], total: 0, page: 1, pageSize: 50 } as any);

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets?sort=priority&order=desc`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(mockListTickets).toHaveBeenCalledWith(
      FAKE_USER.userId,
      PROJECT_ID,
      expect.objectContaining({ sort: 'priority', order: 'desc' }),
    );
  });

  it('returns 400 when sort is not in the whitelist', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets?sort=unknown`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(400);
    expect(mockListTickets).not.toHaveBeenCalled();
  });

  it('returns 400 when order is not in the whitelist', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets?order=sideways`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(400);
    expect(mockListTickets).not.toHaveBeenCalled();
  });

  it('treats absent sort/order as defaults (does not require them in the query)', async () => {
    // Arrange
    const app = buildApp();
    mockListTickets.mockResolvedValue({ tickets: [], total: 0, page: 1, pageSize: 50 } as any);

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(mockListTickets).toHaveBeenCalled();
  });

  it('returns 400 when dueDateFilter has an unknown enum value', async () => {
    // Arrange
    const app = buildApp();
    // Act — "yesterday" is not in the z.enum whitelist.
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets?dueDateFilter=yesterday`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert — Zod validation rejects the unknown enum value with HTTP 400.
    expect(res.status).toBe(400);
    expect(mockListTickets).not.toHaveBeenCalled();
  });

  it('forwards a valid dueDateFilter=overdue to the service layer', async () => {
    // Arrange
    const app = buildApp();
    mockListTickets.mockResolvedValue({ tickets: [], total: 0, page: 1, pageSize: 50 } as any);

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets?dueDateFilter=overdue`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert — service receives the enum value; resolution into where.dueDate
    // happens inside listTickets (covered by the unit spec).
    expect(res.status).toBe(200);
    expect(mockListTickets).toHaveBeenCalledWith(
      FAKE_USER.userId,
      PROJECT_ID,
      expect.objectContaining({ dueDateFilter: 'overdue' }),
    );
  });
});

describe('PATCH /api/v1/projects/:projectId/tickets/bulk', () => {
  const mockBulkUpdate = ticketService.bulkUpdate as jest.MockedFunction<typeof ticketService.bulkUpdate>;

  it('returns 200 with { updated, tickets } envelope for non-delete operations', async () => {
    // Arrange
    const app = buildApp();
    const envelope = {
      updated: 2,
      tickets: [
        { id: 'ticket-uuid-1', number: 1, statusColumnId: COLUMN_ID },
        { id: 'ticket-uuid-2', number: 2, statusColumnId: COLUMN_ID },
      ],
    };
    mockBulkUpdate.mockResolvedValue(envelope as any);

    // Act
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/tickets/bulk`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ ticketNumbers: [1, 2], operation: 'status', value: COLUMN_ID });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ updated: 2 });
    expect(res.body.tickets).toHaveLength(2);
  });

  it('returns 200 with { deleted, ticketNumbers } envelope for delete operation', async () => {
    // Arrange
    const app = buildApp();
    mockBulkUpdate.mockResolvedValue({ deleted: 3, ticketNumbers: [1, 2, 3] } as any);

    // Act
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/tickets/bulk`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ ticketNumbers: [1, 2, 3], operation: 'delete' });

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 3, ticketNumbers: [1, 2, 3] });
  });

  it('returns 400 when ticketNumbers is empty (Zod min(1))', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/tickets/bulk`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ ticketNumbers: [], operation: 'delete' });
    expect(res.status).toBe(400);
    expect(mockBulkUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when ticketNumbers has more than 100 entries (Zod max(100))', async () => {
    const app = buildApp();
    const ticketNumbers = Array.from({ length: 101 }, (_, i) => i + 1);
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/tickets/bulk`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ ticketNumbers, operation: 'delete' });
    expect(res.status).toBe(400);
    expect(mockBulkUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when operation is "delete" and value is provided', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/tickets/bulk`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ ticketNumbers: [1], operation: 'delete', value: COLUMN_ID });
    expect(res.status).toBe(400);
    expect(mockBulkUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when operation is "status" and value is missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/tickets/bulk`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ ticketNumbers: [1], operation: 'status' });
    expect(res.status).toBe(400);
    expect(mockBulkUpdate).not.toHaveBeenCalled();
  });

  it('propagates 403 when the service rejects with forbidden (VIEWER role)', async () => {
    const app = buildApp();
    mockBulkUpdate.mockRejectedValue(new AppError(403, 'Forbidden'));
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/tickets/bulk`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send({ ticketNumbers: [1], operation: 'delete' });
    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    const app = buildApp(false);
    const res = await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/tickets/bulk`)
      .send({ ticketNumbers: [1], operation: 'delete' });
    expect(res.status).toBe(401);
    expect(mockBulkUpdate).not.toHaveBeenCalled();
  });

  it('forwards userId, projectId, and parsed body to the service', async () => {
    const app = buildApp();
    mockBulkUpdate.mockResolvedValue({ updated: 1, tickets: [] } as any);
    const body = { ticketNumbers: [42], operation: 'priority', value: 'HIGH' as const };
    await request(app)
      .patch(`/api/v1/projects/${PROJECT_ID}/tickets/bulk`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .send(body);
    expect(mockBulkUpdate).toHaveBeenCalledWith(FAKE_USER.userId, PROJECT_ID, body);
  });
});

describe('DELETE /api/v1/projects/:projectId/tickets/:ticketNumber', () => {
  it('returns 200 with the deleteTicket result envelope', async () => {
    // Arrange
    const app = buildApp();
    const deleteResult = {
      ticketNumber: 1,
      deleted: true,
      deletedAt: new Date('2026-08-03T13:00:00Z'),
      dependencies: {
        comments: 2,
        linkedAsSource: 1,
        linkedAsTarget: 0,
        meetings: 1,
        activityLogEntries: 4,
        ticketLabels: 1,
      },
    };
    mockDeleteTicket.mockResolvedValue(deleteResult as any);

    // Act
    const res = await request(app)
      .delete(`/api/v1/projects/${PROJECT_ID}/tickets/1`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ticketNumber: 1,
      deleted: true,
      dependencies: deleteResult.dependencies,
    });
    expect(mockDeleteTicket).toHaveBeenCalledWith(FAKE_USER.userId, PROJECT_ID, 1);
  });

  it('propagates 403 when the service rejects with forbidden (VIEWER role)', async () => {
    // Arrange
    const app = buildApp();
    mockDeleteTicket.mockRejectedValue(new AppError(403, 'Forbidden'));

    // Act
    const res = await request(app)
      .delete(`/api/v1/projects/${PROJECT_ID}/tickets/1`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(403);
  });

  it('propagates 404 when the ticket does not exist', async () => {
    // Arrange
    const app = buildApp();
    mockDeleteTicket.mockRejectedValue(new AppError(404, 'Ticket not found'));

    // Act
    const res = await request(app)
      .delete(`/api/v1/projects/${PROJECT_ID}/tickets/9999`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const app = buildApp(false);
    const res = await request(app)
      .delete(`/api/v1/projects/${PROJECT_ID}/tickets/1`);
    expect(res.status).toBe(401);
    expect(mockDeleteTicket).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/projects/:projectId/tickets/:ticketNumber/deletion-impact', () => {
  it('returns 200 with the { ticketNumber, dependencies } envelope', async () => {
    // Arrange
    const app = buildApp();
    const impactResult = {
      ticketNumber: 1,
      dependencies: {
        comments: 3,
        linkedAsSource: 1,
        linkedAsTarget: 2,
        meetings: 0,
        activityLogEntries: 5,
        ticketLabels: 2,
      },
    };
    mockGetDeletionImpact.mockResolvedValue(impactResult as any);

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/1/deletion-impact`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.body).toEqual(impactResult);
    expect(mockGetDeletionImpact).toHaveBeenCalledWith(FAKE_USER.userId, PROJECT_ID, 1);
  });

  it('propagates 403 when the caller is not a project member', async () => {
    // Arrange
    const app = buildApp();
    mockGetDeletionImpact.mockRejectedValue(new AppError(403, 'Forbidden'));

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/1/deletion-impact`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(403);
  });

  it('propagates 404 when the ticket does not exist', async () => {
    // Arrange
    const app = buildApp();
    mockGetDeletionImpact.mockRejectedValue(new AppError(404, 'Ticket not found'));

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/9999/deletion-impact`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const app = buildApp(false);
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/1/deletion-impact`);
    expect(res.status).toBe(401);
    expect(mockGetDeletionImpact).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/projects/:projectId/tickets/:ticketNumber', () => {
  it('returns the relative /api/v1/projects/<id>/tickets/<n>/attachments/<aid>/raw URL for each attachment (bytes are fetched lazily by the dedicated route)', async () => {
    // Arrange — the service builds the attachment URL from projectId + ticket
    // number + attachmentId; the mock row does NOT carry a `url` or
    // the legacy storage key field (the bytes live in
    // `ticket_attachments.bytes BYTEA` and are never embedded in the ticket
    // DTO).
    const app = buildApp();
    const ticketWithAttachment = {
      ...MOCK_TICKET,
      attachments: [
        {
          id: 'att-uuid-1',
          ticketId: MOCK_TICKET.id,
          uploaderId: FAKE_USER.userId,
          uploaderDisplayName: 'Alice',
          mimeType: 'image/png',
          originalName: 'diagram.png',
          sizeBytes: 1024,
          createdAt: new Date('2024-01-02').toISOString(),
          url: `/api/v1/projects/${PROJECT_ID}/tickets/1/attachments/att-uuid-1/raw`,
        },
      ],
    };
    mockGetTicketByNumber.mockResolvedValue(ticketWithAttachment as any);

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/1`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert — the route returns the relative URL the service builds.
    expect(res.status).toBe(200);
    expect(res.body.ticket.attachments).toHaveLength(1);
    expect(res.body.ticket.attachments[0].url).toBe(
      `/api/v1/projects/${PROJECT_ID}/tickets/1/attachments/att-uuid-1/raw`,
    );
  });
});
