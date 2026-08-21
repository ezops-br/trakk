import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('7d'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_REDIRECT_URI: z.string().min(1, 'GOOGLE_REDIRECT_URI is required'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Optional — email notifications
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Optional — file uploads
  UPLOAD_MAX_SIZE_MB: z.coerce.number().optional(),
  UPLOAD_STORAGE_PATH: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const formatted = result.error.errors
    .map(e => `  ${e.path.join('.')}: ${e.message}`)
    .join('\n');
  console.error(`Configuration error — missing or invalid environment variables:\n${formatted}`);
  process.exit(1);
}

export const config = result.data;
export type Config = typeof config;
