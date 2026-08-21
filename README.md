# Trakk

Lightweight, self-hostable issue tracking with a Kanban board and native **Google Calendar + Google Meet** integration. Built for small-to-mid teams who want Linear-like speed without the SaaS lock-in.

Sign in with Google, create a project, drag tickets, schedule a meeting: done. No configuration wizards, no plugin marketplace, no vendor lock-in.

## Features

- **Kanban board**: drag tickets between status columns, drag to delete, filter by assignee / priority / label
- **Tickets**: Markdown descriptions, priorities, labels, assignees, auto-numbered per project (`TRAKK-42`)
- **Comments & activity**: threaded comments with @mention autocomplete and a full audit trail on every ticket
- **Project settings**: custom status columns, labels, and member management with Owner / Member / Viewer roles
- **Google Calendar sidebar**: today's events on the dashboard with date navigation and a per-date cache
- **Meetings on tickets**: schedule a Google Meet directly on a ticket; it lands on everyone's calendar
- **Quick Meet**: one-click instant Meet link attached to a ticket
- **Durable meeting reminders**: a pg-boss job queue posts a reminder comment 15 minutes before every meeting, surviving server restarts
- **Personal dashboard**: assigned tickets, recent activity, upcoming meetings across all projects
- **Command palette**: `Cmd+K` / `Ctrl+K` global search and quick actions
- **Real-time updates**: SSE-based live board and dashboard updates, no polling
- **User profiles**: avatar upload, display name, theme preference (light/dark), Google disconnect
- **S3-compatible avatar storage**: local disk in dev, any S3-compatible bucket in production
- **Self-hosted**: one Docker Compose file runs the entire stack, including an nginx reverse proxy

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="screenshots/chrome_QgiXXCwJi9.png" alt="Trakk interface" width="100%" /></td>
    <td width="50%"><img src="screenshots/chrome_xpt1vhVxxk.png" alt="Trakk interface" width="100%" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="screenshots/chrome_AzXv1uaKwy.png" alt="Trakk interface" width="100%" /></td>
    <td width="50%"><img src="screenshots/chrome_3srJuKW4L3.png" alt="Trakk interface" width="100%" /></td>
  </tr>
</table>

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, @dnd-kit |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 |
| Auth | Google OAuth 2.0, JWT in HTTP-only cookie |
| Job queue | pg-boss (runs inside PostgreSQL, no separate queue service) |
| Containers | Docker, Docker Compose |
| Testing | Jest + Supertest (backend), Vitest + React Testing Library (frontend) |

## Architecture

```
Browser
  │
  ├── Next.js (port 3000)
  │     Server components  →  INTERNAL_API_URL (Docker-internal)
  │     Client components  →  NEXT_PUBLIC_API_URL (browser fetch)
  │
  └── Express API (port 4000)
        ├── PostgreSQL 16 via Prisma ORM
        ├── Google Calendar API  (credentials never leave the backend)
        └── pg-boss job queue   (runs inside PostgreSQL)

Traffic in production flows through nginx on port 80 → /api/* to the backend, everything else to the frontend.
```

**Key design decisions**

- Google API credentials are server-side only; the frontend has no direct access
- JWT sessions in HTTP-only cookies, independent of the Google token lifecycle
- Google refresh tokens are encrypted at rest (AES-256-GCM via `TOKEN_ENCRYPTION_KEY`)
- Roles are project-scoped (Owner / Member / Viewer); no global admin
- Every route derives the caller's role from the database, never from the request body
- SSE for real-time board and dashboard updates without WebSockets or polling
- Meeting reminders are durable pg-boss jobs, rehydrated on every server start

## Quick Start

Requirements:

- **Docker** and **Docker Compose** (v2)
- A **Google Cloud project** with the Calendar API enabled and OAuth 2.0 credentials

No local Node.js, npm, or PostgreSQL needed; everything runs inside Docker.

### 1. Clone and configure

```bash
git clone https://github.com/your-org/trakk.git
cd trakk
cp .env.example .env
```

Open `.env` and fill in the required values:

| Variable | How to get it |
|---|---|
| `POSTGRES_PASSWORD` | Any strong random password |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Same credentials page |
| `JWT_SECRET` | Any random string: `openssl rand -hex 32` |
| `TOKEN_ENCRYPTION_KEY` | A 32-byte hex string (64 hex chars): `openssl rand -hex 32` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same value as `GOOGLE_CLIENT_ID` |

Everything else has a working default for local development.

### 2. Google Cloud Console setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project.
2. Enable the **Google Calendar API** (APIs & Services → Library → search "Google Calendar API").
3. Configure the **OAuth consent screen** (External, add your email as a test user).
4. Create **OAuth 2.0 credentials** (Credentials → Create → OAuth client ID → Web application).
5. Add this **Authorized redirect URI**:
   ```
   http://localhost:4000/api/v1/auth/google/callback
   ```
6. Copy the Client ID and Client Secret into `.env`.

### 3. Start

```bash
docker compose up -d --build
```

The stack starts five services in dependency order:

1. **db**: PostgreSQL 16 with a named volume
2. **migrate**: runs `prisma migrate deploy` once, exits 0
3. **backend**: Express API (waits for migrations to complete)
4. **frontend**: Next.js standalone build (waits for the backend health check)
5. **nginx**: reverse proxy on port 80; routes `/api/` to the backend and everything else to the frontend

Open **http://localhost** (nginx), or bypass nginx at **http://localhost:3000** (frontend) and **http://localhost:4000/api/v1** (backend).

First boot takes ~30 seconds while Docker builds images and runs migrations. Subsequent starts are instant.

## Environment Variables

`.env.example` documents every variable. Key ones explained:

### Required

```bash
# Database
POSTGRES_USER=trakk
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=trakk
DATABASE_URL=postgresql://trakk:${POSTGRES_PASSWORD}@db:5432/trakk

# Google OAuth: from Google Cloud Console
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:4000/api/v1/auth/google/callback

# Security (generate with: openssl rand -hex 32)
JWT_SECRET=...              # signs JWT session tokens
TOKEN_ENCRYPTION_KEY=...    # encrypts Google refresh tokens at rest (must be 64 hex chars)
```

### Optional (have sensible defaults)

```bash
JWT_EXPIRY=7d               # session lifetime
PORT=4000
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:4000       # bare origin, no /api/v1 suffix
INTERNAL_API_URL=http://backend:4000/api/v1    # used by Next.js server components over Docker network
NEXT_PUBLIC_GOOGLE_CLIENT_ID=                   # same value as GOOGLE_CLIENT_ID

# S3-compatible avatar storage (leave blank to use local disk)
S3_BUCKET=
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=              # e.g. https://your-bucket.s3.amazonaws.com
```

## Avatar Storage

By default avatars are stored on local disk inside the Docker volume. This works fine for a single-instance deploy but is not suitable for multi-server setups or ephemeral containers (files are lost on volume deletion).

### Local disk (default)

No configuration needed. Avatars are written to `uploads/avatars/` and served by the backend at `/api/v1/uploads/avatars/<filename>`. Leave all `S3_*` variables blank.

### S3-compatible storage

Set the following variables in `.env`:

```bash
S3_BUCKET=your-bucket-name
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_URL=https://your-bucket.s3.amazonaws.com
```

The backend auto-selects S3 when `S3_BUCKET` is set. Avatar URLs stored in the database will point to `S3_PUBLIC_URL/avatars/<filename>`. Make sure the bucket is publicly readable or fronted by a CDN.

Works with any S3-compatible provider (AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces). For providers with a custom endpoint, set `S3_PUBLIC_URL` to your CDN or custom domain.

**IAM permissions required** (AWS example):

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject", "s3:DeleteObject"],
  "Resource": "arn:aws:s3:::your-bucket-name/avatars/*"
}
```

## Development

### Common commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Shell access
docker compose exec backend sh
docker compose exec db psql -U trakk trakk

# Database migrations (after editing backend/prisma/schema.prisma)
docker compose exec backend npx prisma migrate dev --name describe-your-change

# Apply existing migrations after a git pull
docker compose exec backend npx prisma migrate deploy

# Regenerate Prisma client after a schema change
docker compose exec backend npx prisma generate
```

### Running without Docker

Requires a running PostgreSQL instance at `localhost:5432` (database `trakk`, user `trakk`, password `trakk_dev`).

```bash
# Backend
cd backend
npm install
DATABASE_URL="postgresql://trakk:trakk_dev@localhost:5432/trakk" npx prisma migrate dev
npm run dev   # http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev   # http://localhost:3000
```

> On Windows PowerShell, set `DATABASE_URL` as an environment variable before running Prisma instead of using the inline prefix syntax.

## Tests

```bash
# Backend: Jest + Supertest
cd backend && npm test

# Run a specific test file
cd backend && npm test -- --testPathPattern="auth.service"

# Frontend: Vitest + React Testing Library
cd frontend && npm test

# Type-check without running tests
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

Test files live alongside source (`*.spec.ts` in backend, `*.test.ts` / `*.test.tsx` in frontend).

## Project Structure

```
trakk/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Database schema (source of truth)
│   │   └── migrations/            # Migration history (never hand-edit)
│   └── src/
│       ├── lib/                   # Prisma client, job queue, avatar storage, SSE broadcasters
│       ├── middleware/            # JWT auth, rate limiting, Zod validation
│       ├── routes/                # Express routers + request schemas
│       └── services/              # Business logic (one file per domain)
├── frontend/
│   └── src/
│       ├── app/                   # Next.js App Router pages
│       ├── components/            # React components
│       ├── hooks/                 # Data-fetching and mutation hooks
│       └── lib/                   # API client, shared types, utilities
├── nginx/
│   └── nginx.conf                 # Reverse proxy (SSE-aware), routes /api/ to backend
├── infra/                         # Infrastructure / deployment assets
├── docker-compose.yml             # Full stack: db + migrate + backend + frontend + nginx
└── .env.example                   # Template for environment variables
```

## Contributing

Contributions are welcome. Please follow these conventions:

- Branch naming: `feature/description`, `bugfix/description`, `hotfix/description`
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Add unit tests alongside new code (`*.spec.ts` backend / `*.test.ts(x)` frontend)
- Keep secrets out of code; all configuration goes through environment variables
- Run the tests and type-check (`npm test` + `npx tsc --noEmit`) before opening a PR

## License

Licensed under the [Business Source License 1.1](LICENSE). You are free to use, modify, and play with Trakk for non-production purposes, including using it as a demo or starting template. Using it to compete with the licensor, or in production without a commercial agreement, is not permitted. The license converts to Apache License 2.0 after the change date.

See the [LICENSE](LICENSE) file for full terms. Commercial licensing is available on request.
