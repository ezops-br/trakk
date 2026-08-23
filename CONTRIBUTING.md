# Contributing

This guide is for contributors running Trakk locally and opening a pull request. It is a complement to `README.md`, not a replacement.

## Local setup

Prerequisites:

- Docker and Docker Compose v2.
- A Google Cloud project with the Calendar API enabled and OAuth 2.0 credentials.

The whole stack runs from the existing `docker-compose.yml` at the repo root. No local Node.js, npm, or PostgreSQL needed.

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
# JWT_SECRET, TOKEN_ENCRYPTION_KEY, NEXT_PUBLIC_GOOGLE_CLIENT_ID
docker compose up -d --build
```

Compose brings up five services:

- `db` — Postgres 16.
- `migrate` — runs `prisma migrate deploy` once, then exits.
- `backend` — Express, on `:4000`.
- `frontend` — Next.js, on `:3000`.
- `nginx` — reverse proxy, the public entry at `http://localhost`.

The full Google Cloud Console OAuth walkthrough (creating the project, enabling the Calendar API, configuring the consent screen, creating OAuth credentials, and the authorized redirect URI) is in [README.md §"Quick Start"](./README.md#quick-start); do not duplicate it here.

## Tests

Run all unit and integration tests in one stack at a time. The commands are the real scripts declared in each `package.json`.

```bash
# Backend: Jest + Supertest
cd backend && npm test

# Frontend: Vitest + React Testing Library
cd frontend && npm test
```

Test layout:

- Backend — `backend/src/**/*.spec.ts` for units, `backend/src/**/*.integration.spec.ts` for Supertest-based integration specs. Both live next to the code they cover.
- Frontend — `frontend/src/**/*.test.ts` and `frontend/src/**/*.test.tsx`, next to the component or hook under test. Configured by `frontend/vitest.config.ts` with a jsdom env and setup at `frontend/src/test-setup.ts`.

Type-check without running tests:

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## Branch and commit conventions

Quoted from [README.md §"Contributing"](./README.md#contributing):

- Branches — `feature/<slug>`, `bugfix/<slug>`, `hotfix/<slug>`. Slug is lowercase, hyphen-separated, no spaces.
- Commits — Conventional Commits, one of `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.

## Pull request checklist

Before requesting review, confirm:

- [ ] `cd backend && npm test` passes
- [ ] `cd frontend && npm test` passes
- [ ] `npx tsc --noEmit` passes in both `backend/` and `frontend/`
- [ ] Branch follows `feature|bugfix|hotfix/<slug>` and commits follow Conventional Commits
- [ ] No secrets in the diff (`.env`, credentials, tokens)
- [ ] PR description explains the change and links the issue it addresses
