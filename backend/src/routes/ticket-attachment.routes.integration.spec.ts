// @ts-nocheck
// Integration tests for the ticket-attachment router.
// Covers the GET .../raw route — the only new behavior introduced when S3 was
// dropped from the ticket-attachment path. Tests verify:
//   * 200 — body matches the persisted bytes, Content-Type + Content-Length
//   * 404 — when the attachmentId is on a different ticket
//   * 401 — when no authenticated user is on the request
//   * 403 — when the caller is not a project member
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { errorHandler } from '../middleware/error-handler';
import { AppError, notFound, forbidden } from '../lib/app-error';

// Mock the attachment service (no module path dependency on side-effects).
jest.mock('../services/ticket-attachment.service', () => ({
  listAttachments: jest.fn(),
  uploadAttachment: jest.fn(),
  deleteAttachment: jest.fn(),
  getAttachmentForDownload: jest.fn(),
}));
jest.mock('../middleware/auth');

import { ticketAttachmentRouter } from './ticket-attachment.routes';
import * as attachmentService from '../services/ticket-attachment.service';
import * as authMiddleware from '../middleware/auth';

const mockGetAttachmentForDownload =
  attachmentService.getAttachmentForDownload as jest.MockedFunction<
    typeof attachmentService.getAttachmentForDownload
  >;
const mockRequireAuth = authMiddleware.requireAuth as jest.MockedFunction<
  typeof authMiddleware.requireAuth
>;

const FAKE_USER = { userId: 'user-uuid-1', email: 'alice@example.com' };
const OTHER_USER = { userId: 'other-user-id', email: 'bob@example.com' };
const PROJECT_ID = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';
const ATTACHMENT_ID = 'c1d2e3f4-a5b6-789c-def0-123456789012';
const VALID_SESSION = 'valid.session.token';
// Historical sizeBytes carried by a legacy pre-bytea S3-era row (PR #39). The
// service returns 404 for these rows because their bytes payload is NULL, but
// sizeBytes is still in the row — the route must never echo it via
// res.setHeader('Content-Length', String(sizeBytes)), or the browser would
// see a lying Content-Length and a broken image.
const LEGACY_BYTES_SIZE = 999_999;

const FAKE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F']);

const MOCK_DOWNLOAD = {
  bytes: FAKE_BYTES,
  mimeType: 'image/jpeg',
  sizeBytes: FAKE_BYTES.length,
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

  app.use('/api/v1/projects', ticketAttachmentRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAttachmentForDownload.mockResolvedValue(MOCK_DOWNLOAD);
});

// ─── GET .../raw ─────────────────────────────────────────────────────────────

describe('GET /api/v1/projects/:projectId/tickets/:ticketNumber/attachments/:attachmentId/raw', () => {
  it('returns 200 with image bytes + Content-Type + Content-Length (no Content-Disposition)', async () => {
    // Arrange
    const app = buildApp();

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/7/attachments/${ATTACHMENT_ID}/raw`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    // Assert — service was called with the right ids, headers are correct,
    // and the body matches the persisted bytes.
    expect(mockGetAttachmentForDownload).toHaveBeenCalledWith(
      FAKE_USER.userId,
      PROJECT_ID,
      7,
      ATTACHMENT_ID,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-length']).toBe(String(FAKE_BYTES.length));
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).equals(FAKE_BYTES)).toBe(true);
  });

  it('returns 404 when the attachmentId is on a different ticket', async () => {
    // Arrange — service throws 404 (attachment.ticketId !== ticket.id)
    mockGetAttachmentForDownload.mockRejectedValue(notFound('Attachment not found for this ticket'));

    const app = buildApp();

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/7/attachments/${ATTACHMENT_ID}/raw`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringMatching(/not found/i) });
  });

  // Legacy rows from the pre-bytea S3 era (PR #39) have bytes = NULL. The
  // service throws 404 (notFound) for those rows, and the route's
  // defense-in-depth guard also fires if the service ever returns null bytes.
  // Either way, the 404 must fire BEFORE any res.setHeader in the route —
  // otherwise the browser would see a Content-Length set to the historical
  // sizeBytes but receive 0 bytes (a broken image and a network error).
  // Node's HTTP server may still auto-set Content-Length to the 404 body size;
  // what matters is that the response's Content-Length is NOT the lying
  // legacy row's sizeBytes.
  it('returns 404 (without lying Content-Length) when the row has bytes=null (legacy PR #39 row)', async () => {
    // Arrange — service surfaces 404 (the typical path for legacy rows)
    mockGetAttachmentForDownload.mockRejectedValue(
      notFound('Attachment bytes are not available'),
    );

    const app = buildApp();

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/7/attachments/${ATTACHMENT_ID}/raw`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert — 404 with the same body shape as other 404s, and the route
    // handler must NOT have explicitly set Content-Length to a fake value.
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringMatching(/not available/i) });
    // Node auto-sets Content-Length to the 404 body size; what matters is
    // that it's NOT the legacy row's sizeBytes — which the route only learns
    // from the service, and the service throws before returning anything.
    expect(res.headers['content-length']).not.toBe(String(LEGACY_BYTES_SIZE));
  });

  // Defense-in-depth: even if the service layer regressed and returned a row
  // whose bytes is null/undefined (but the row does carry a legacy sizeBytes),
  // the route handler must still throw 404 BEFORE the route's own
  // res.setHeader('Content-Length', String(result.sizeBytes)). This protects
  // the "no lying Content-Length" invariant from a future service regression.
  it('route handler throws 404 before setting Content-Length to legacy sizeBytes when service returns bytes=null', async () => {
    // Arrange — service returns a result whose bytes is null but sizeBytes is
    // a fake "legacy" value (regression case). The route's defense-in-depth
    // guard must throw 404 BEFORE res.setHeader('Content-Length', '999999').
    mockGetAttachmentForDownload.mockResolvedValue({
      bytes: null,
      mimeType: 'image/png',
      sizeBytes: LEGACY_BYTES_SIZE,
    });

    const app = buildApp();

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/7/attachments/${ATTACHMENT_ID}/raw`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert — 404 fires before the route sets Content-Length to the legacy
    // value; the auto-set Content-Length on the 404 body is much smaller.
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringMatching(/not available/i) });
    expect(res.headers['content-length']).not.toBe(String(LEGACY_BYTES_SIZE));
  });

  it('returns 401 when the request has no authenticated user', async () => {
    // Arrange
    const app = buildApp(false);

    // Act
    const res = await request(app).get(
      `/api/v1/projects/${PROJECT_ID}/tickets/7/attachments/${ATTACHMENT_ID}/raw`,
    );

    // Assert — auth middleware short-circuits, service never called
    expect(res.status).toBe(401);
    expect(mockGetAttachmentForDownload).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a project member', async () => {
    // Arrange — service throws 403 (no membership)
    mockGetAttachmentForDownload.mockRejectedValue(forbidden());
    const app = buildApp();
    // Re-bind the user so the membership check (inside the service) is the
    // thing that throws — the alternative path (no auth) was covered above.
    mockRequireAuth.mockImplementation((req, _res, next) => {
      req.user = OTHER_USER;
      next();
    });

    // Act
    const res = await request(app)
      .get(`/api/v1/projects/${PROJECT_ID}/tickets/7/attachments/${ATTACHMENT_ID}/raw`)
      .set('Cookie', `trakk_session=${VALID_SESSION}`);

    // Assert
    expect(res.status).toBe(403);
    expect(mockGetAttachmentForDownload).toHaveBeenCalledWith(
      OTHER_USER.userId,
      PROJECT_ID,
      7,
      ATTACHMENT_ID,
    );
  });
});