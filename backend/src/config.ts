import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('7d'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Legacy ingress compatibility: "true" skips this app's cors() middleware
  // when an upstream supplies the headers. Sandbox browser requests now use
  // the frontend origin and Next's internal API routing, not cross-host CORS.
  DISABLE_APP_CORS: z.string().optional(),
  // Optional legacy cross-origin deployments only. Empty means host-only;
  // sandbox and same-origin production use that default. Never widen this
  // cookie to a parent domain shared with another tenant's sandbox.
  SESSION_COOKIE_DOMAIN: z.string().optional(),
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
