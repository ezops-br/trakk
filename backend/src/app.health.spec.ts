// @ts-nocheck
// TDD Red Phase — health check DB probe does not exist yet.
// Tests for GET /api/v1/health with Prisma $queryRaw probe.

// Mock pg-boss (ESM-only) before any module that transitively imports it.
// meeting.service.ts → job-queue.ts → pg-boss would fail Jest's CJS transform.
jest.mock('./lib/job-queue', () => ({
  boss: {
    send: jest.fn().mockResolvedValue(null),
    cancel: jest.fn().mockResolvedValue(undefined),
    work: jest.fn().mockResolvedValue(undefined),
  },
  startJobQueue: jest.fn().mockResolvedValue(undefined),
}));

// Mock prisma before importing app so the module picks up the mock
jest.mock('./lib/prisma', () => {
  const db = {
    $queryRaw: jest.fn(),
  };
  return { prisma: db };
});

import request from 'supertest';
import { prisma } from './lib/prisma';
import app from './app';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/v1/health', () => {
  describe('when database is reachable', () => {
    it('returns HTTP 200 with status "ok" and db "ok"', async () => {
      // Arrange — $queryRaw resolves (DB is up)
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);

      // Act
      const res = await request(app).get('/api/v1/health');

      // Assert
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        db: 'ok',
      });
    });

    it('includes a timestamp field in the response', async () => {
      // Arrange
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);

      // Act
      const res = await request(app).get('/api/v1/health');

      // Assert — timestamp must be present and parseable as ISO date
      expect(res.body.timestamp).toBeDefined();
      const ts = new Date(res.body.timestamp);
      expect(ts.toISOString()).toBe(res.body.timestamp);
    });

    it('calls prisma.$queryRaw to verify DB connectivity', async () => {
      // Arrange
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);

      // Act
      await request(app).get('/api/v1/health');

      // Assert — DB probe was executed
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('when database is unreachable', () => {
    it('returns HTTP 503 with status "error" and db "unreachable"', async () => {
      // Arrange — $queryRaw rejects (DB is down)
      (mockPrisma.$queryRaw as jest.Mock).mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      // Act
      const res = await request(app).get('/api/v1/health');

      // Assert
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        status: 'error',
        db: 'unreachable',
      });
    });

    it('includes a timestamp field even when DB is down', async () => {
      // Arrange
      (mockPrisma.$queryRaw as jest.Mock).mockRejectedValueOnce(
        new Error('ECONNREFUSED'),
      );

      // Act
      const res = await request(app).get('/api/v1/health');

      // Assert
      expect(res.body.timestamp).toBeDefined();
      const ts = new Date(res.body.timestamp);
      expect(ts.toISOString()).toBe(res.body.timestamp);
    });

    it('does not return HTTP 500 or let the error bubble to the global error handler', async () => {
      // Arrange — a fatal DB error
      (mockPrisma.$queryRaw as jest.Mock).mockRejectedValueOnce(
        new Error('Fatal DB error'),
      );

      // Act
      const res = await request(app).get('/api/v1/health');

      // Assert — must be 503, not 500 or anything else
      expect(res.status).toBe(503);
      expect(res.status).not.toBe(500);
    });
  });
});
