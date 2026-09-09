import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z.string().default('7d'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Optional — skips this app's own cors() middleware when set to "true".
  // Needed behind the Daytona sandbox ingress proxy, which unconditionally
  // adds its own Access-Control-Allow-Origin to every response (confirmed:
  // even a 401 the proxy generates itself, before reaching this app, already
  // carries one). Stacking our own header on top produces two identical
  // Access-Control-Allow-Origin values, which browsers reject outright as
  // invalid — one value is all the spec allows. Not needed in prod (the ALB
  // doesn't inject CORS headers), so leave unset there.
  DISABLE_APP_CORS: z.string().optional(),
  // Optional — widens the trakk_session cookie's Domain attribute so it's
  // sent to every subdomain of this value, not just the exact host that set
  // it. Needed in the sandbox: the cookie is set by the backend's own origin
  // (port :4000) after the OAuth exchange, but the dashboard's server
  // component reads cookies from requests made to the FRONTEND's origin
  // (port :80) — a different host, so a host-only cookie never reaches it.
  // Prod doesn't need this (frontend and backend share one ALB origin).
  // Security note: only set this to a domain you don't share with other
  // tenants — widening it to a shared multi-tenant domain would send this
  // session cookie to every subdomain under it, not just your own sandbox.
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
