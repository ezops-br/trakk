# Trakk

Lightweight, self-hostable issue tracking with a Kanban board. Built for small-to-mid teams who want Linear-like speed without the SaaS lock-in.

Log in, create a project, drag tickets: done. No configuration wizards, no plugin marketplace, no vendor lock-in.

## Features

- **Kanban board**: drag tickets between status columns, drag to delete, filter by assignee / priority / label
- **Tickets**: Markdown descriptions, priorities, labels, assignees, due dates, auto-numbered per project (`TRAKK-42`)
- **Ticket templates**: reusable templates per project to speed up ticket creation
- **Ticket links**: relate tickets to each other (blocks / relates to / duplicates)
- **Attachments**: upload files directly on a ticket, stored in Postgres
- **Comments & activity**: threaded comments with @mention autocomplete and a full audit trail on every ticket
- **Project settings**: custom status columns, labels, and member management with Owner / Member / Viewer roles
- **Search**: global search across tickets and projects
- **Personal dashboard**: assigned tickets and recent activity across all projects
- **Command palette**: `Cmd+K` / `Ctrl+K` global search and quick actions
- **Real-time updates**: SSE-based live board and dashboard updates, no polling
- **User profiles**: avatar upload, display name, theme preference (light/dark)
- **Avatar storage**: local disk by default, or any S3-compatible bucket
- **Auth**: email/password sessions (JWT in an HTTP-only cookie). No self-serve sign-up — users are provisioned via the seed script
- **Self-hosted**: one Docker Compose file runs the entire stack

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="screenshots/chrome_QgiXXCwJi9.png" alt="Trakk interface" width="100%" /></td>
    <td width="50%"><img src="screenshots/chrome_AzXv1uaKwy.png" alt="Trakk interface" width="100%" /></td>
  </tr>
  <tr>
    <td width="50%" colspan="2"><img src="screenshots/chrome_3srJuKW4L3.png" alt="Trakk interface" width="100%" /></td>
  </tr>
</table>

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, @dnd-kit |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 |
| Auth | Email/password, JWT in HTTP-only cookie |
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
  └── Express API (port 80 → container port 4000)
        ├── PostgreSQL 16 via Prisma ORM
        └── SSE for real-time board and dashboard updates
```

No reverse proxy in front of the stack: the backend is published directly on host port 80 and the frontend on port 3000. The ephemeral sandbox exposes the same two ports (see `sandbox-setup.sh`).

**Key design decisions**

- JWT sessions in HTTP-only cookies; no self-serve registration, users come from `prisma/seed.ts`
- Roles are project-scoped (Owner / Member / Viewer); no global admin
- Every route derives the caller's role from the database, never from the request body
- SSE for real-time board and dashboard updates without WebSockets or polling
- Ticket attachments are stored as bytes in Postgres, not on disk or S3

## Quick Start

Requirements: **Docker** and **Docker Compose** (v2). No local Node.js, npm, or PostgreSQL needed — everything runs inside Docker.

### 1. Clone and configure

```bash
git clone https://github.com/your-org/trakk.git
cd trakk
cp .env.example .env
```

Fill in `.env`:

| Variable | How to get it |
|---|---|
| `POSTGRES_PASSWORD` | Any strong random password |
| `JWT_SECRET` | 64-char random string: `openssl rand -hex 32` |

Everything else in `.env.example` has a working default for local development.

### 2. Run it

The `local-setup.sh` script is the recommended way to run the stack locally — it wraps `docker compose` and also rotates `JWT_SECRET`, wipes and rebuilds the stack, waits for both services to be healthy, and seeds the database (there is no login-able user otherwise):

```bash
./local-setup.sh
```

Equivalent manual steps, if you'd rather not use the script:

```bash
docker compose up -d --build
docker compose exec -T backend npx prisma db seed
```

### 3. Access it

| | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost/api/v1 |

Log in with the seeded admin account:

```
email:    admin@trakk.local
password: admin123
```

First boot takes ~30 seconds while Docker builds images and runs migrations. Subsequent runs of `local-setup.sh` wipe the database volume (`docker compose down -v`) and reseed it, so any data you created is lost on every re-run — that's by design, for a clean local dev loop.

## Running in a sandbox

`sandbox-setup.sh` brings up the same stack inside an ephemeral Daytona sandbox instead of your own machine — **without Docker**. The sandbox has no root, and `dockerd` only starts as root, so the script runs PostgreSQL, the backend and the frontend as plain processes of whoever calls it. Differences from `local-setup.sh`:

- Tools come from `devbox.json` (Node.js 22, PostgreSQL 16), installed with Devbox/Nix, which the sandbox image ships. `devbox.lock` pins the exact versions.
- It reads `.env.sandbox` (committed to the repo) instead of a hand-written `.env`. `.env.sandbox` has non-secret config baked in plus placeholders (`__FRONTEND_URL__`, `__BACKEND_URL__`, `__COOKIE_DOMAIN__`, `__BACKEND_PORT__`, `__DB_PORT__`, `__JWT_SECRET__`) that the script fills in at runtime, since every sandbox gets a different hostname/UUID.
- The database, logs and process ids live in a per-user directory (`~/.local/state/trakk-sandbox`), because the agent and each member are different Linux users sharing the checkout. The database survives re-runs; the seed runs only when the database is first created.
- URLs follow the pattern `https://<port>-<sandbox-uuid>.<domain>` (default domain `sandbox.acedev.ai`). Override with `SANDBOX_DOMAIN` (may include a port) and `SANDBOX_SCHEME`; ports with `FRONTEND_PORT`, `BACKEND_PORT` and `DB_PORT` (defaults 3000, 80, 5432).

Run it:

```bash
./sandbox-setup.sh
```

It prints the computed frontend/backend URLs and the log directory when done. Re-running it stops the previous run first. Log in with the same seeded account as local (`admin@trakk.local` / `admin123`).

The rendered `.env` is gitignored and regenerated on every run — to change a non-secret config value, edit `.env.sandbox` (the committed template) instead, not `.env`.

## Environment Variables

`.env.example` documents every variable read by `docker-compose.yml`. The backend validates its own subset at boot (`backend/src/config.ts`):

### Required

```bash
DATABASE_URL=postgresql://trakk:${POSTGRES_PASSWORD}@db:5432/trakk
JWT_SECRET=...   # at least 32 characters — openssl rand -hex 32
```

### Optional (sensible defaults)

```bash
JWT_EXPIRY=7d
PORT=4000
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
DISABLE_APP_CORS=      # sandbox-only, see config.ts comment
SESSION_COOKIE_DOMAIN= # widen the session cookie's Domain attribute; sandbox-only

# Frontend
NEXT_PUBLIC_API_URL=http://localhost   # bare origin, no /api/v1 suffix
INTERNAL_API_URL=http://backend:4000/api/v1

# Avatar storage — leave blank to use local disk
S3_BUCKET=
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=
AVATAR_UPLOAD_DIR=      # local disk path, defaults to ./uploads/avatars
```

`SMTP_*` and `UPLOAD_STORAGE_PATH` / `UPLOAD_MAX_SIZE_MB` are also accepted by `config.ts` but are not wired to any feature yet.

## Avatar Storage

The backend auto-selects storage based on `S3_BUCKET`:

- **Blank (default)**: avatars are written to local disk (`AVATAR_UPLOAD_DIR`, default `./uploads/avatars`) and served at `/api/v1/uploads/avatars/<filename>`. Fine for a single-instance deploy; not suitable for multi-server setups since files live in the container volume.
- **Set**: avatars go to the S3-compatible bucket named by `S3_BUCKET`. Works with AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces — set `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_PUBLIC_URL` (your bucket's or CDN's public base URL). The bucket must be publicly readable or fronted by a CDN.

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
│   │   ├── seed.ts                # Seeds the admin user + demo data
│   │   └── migrations/            # Migration history (never hand-edit)
│   └── src/
│       ├── lib/                   # Prisma client, avatar storage, SSE broadcasters
│       ├── middleware/            # JWT auth, rate limiting, Zod validation
│       ├── routes/                # Express routers + request schemas
│       └── services/              # Business logic (one file per domain)
├── frontend/
│   └── src/
│       ├── app/                   # Next.js App Router pages
│       ├── components/            # React components
│       ├── hooks/                 # Data-fetching and mutation hooks
│       └── lib/                   # API client, shared types, utilities
├── docker-compose.yml             # Full stack: db + migrate + backend + frontend
├── local-setup.sh                 # Recommended way to run the stack locally
├── sandbox-setup.sh               # Runs the stack inside an ephemeral Daytona sandbox (no Docker)
├── devbox.json / devbox.lock      # Tools for sandbox-setup.sh: Node.js 22, PostgreSQL 16
├── .env.example                   # Template for a local .env
└── .env.sandbox                   # Committed template rendered into .env by sandbox-setup.sh
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
