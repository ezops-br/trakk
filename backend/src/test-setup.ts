// Sets required environment variables before any module (including config.ts) is loaded.
// Jest's setupFiles run before test file imports, so config validation sees these values.

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_trakk';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.JWT_EXPIRY = '7d';
process.env.PORT = '4001';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
