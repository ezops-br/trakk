// Sets required environment variables before any module (including config.ts) is loaded.
// Jest's setupFiles run before test file imports, so config validation sees these values.

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_trakk';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.JWT_EXPIRY = '7d';
process.env.PORT = '4001';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:4000/api/v1/auth/google/callback';
// 64 valid hex characters (each 'a' is a hex digit 10)
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
process.env.NODE_ENV = 'test';
