# Authenticated sandbox application preview

- Status: Current
- Story ID: SANDBOX-PREVIEW-001
- Owner: frontend routing and sandbox setup

## Persona and outcome

An ACE project member opens the seeded TRAKK app from their sandbox to inspect
a requested change. They need to sign in and reload the dashboard without
opening private application ports to anonymous visitors. The 2026-11-03 local
journey rendered login but its cross-host API preflight was rejected by the
ACE proxy before TRAKK could verify credentials.

## Contract and scenarios

- S01: Given a signed frontend preview, when the browser calls `/api/v1`, Next
  forwards the request to the configured internal API. The browser stays on
  one origin, including session, JSON requests, attachments and SSE. Existing
  explicit public API configuration outside sandbox setup is unchanged.
- S02: Given sandbox setup, browser API configuration is empty (relative to
  the frontend origin), and `trakk_session` has no parent Domain. Login,
  reload and logout therefore use one host; no other sandbox receives it.
- S03: Given no internal API setting, the local development routing target
  remains `http://localhost:4000/api/v1`. Next health routes are unaffected.
- S04: Given a bare branded proxy URL with no accepted ACE authorization, access
  stays denied. Use the existing signed sandbox preview or supported IDE
  forwarding. This change does not relax ACE session, port or WebSocket guards.
- S05: Given a running development preview, an agent's production build writes
  to `.next` while the development server uses `.next-dev`. A build must not
  replace the member's active server chunks. The 2026-11-03 shared-directory
  build otherwise reproduced `Cannot find module './948.js'` in the browser.
- S06: Project and dashboard SSE responses declare `no-cache, no-transform`,
  and `X-Accel-Buffering: no`, preserving event framing through proxies.
  Members must receive updates without a reload; authentication and project
  membership remain prerequisites. Subscription/interval cleanup follows the
  response's close event, so a parsed empty request does not end a live stream
  or leave an interval behind. The signed-preview limitation below remains open.

The API still authenticates and authorizes every protected operation. Failure
from the API is forwarded honestly. No broad CORS exception, extra identity
system, provider secret or new dependency is introduced. Application setup
preserves the existing database on retry; the seed is not rerun against it.
After its fallback Devbox install it makes only its own generated regular files
and directories group-readable/writable, preserving shared-project autosave.
Symlinks into the Nix store and files owned by another user are not changed.
Evidence: the 2026-11-03 human fallback created `.devbox/gen` mode2700, and
ACE autosave refused the unreadable directory with `snapshot_unreadable_directory`.

## Validation and rollback

S01–S03 and S05: `frontend/src/lib/sandbox-preview.test.ts`, plus the real browser journey
recorded in the task evidence. S04 belongs to ACE proxy's existing S07 tests.
S06: `backend/src/routes/events-stream.integration.spec.ts` exercises actual
HTTP event frames and the existing authentication/membership boundaries.
The new and existing dashboard route tests passed (13 tests), including empty
proxy GETs and authentication/membership. Backend build and production/new-test
lint passed. The old dashboard test retains its pre-existing `@ts-nocheck` lint
violation; its obsolete virtual mock/stale missing-module comments were removed.
Local forwarding of the same sandbox app proved live movement and creation:
the board received `ticket.created`, refetched counts and changed the empty
message without reload; the detail stayed open during movement. The development
preview also survived a real concurrent production build after S05 was applied.

**Open runtime limit (2026-11-03):** both existing and newly generated signed
preview aliases authenticated/served JSON but timed out opening SSE, from the
browser and an independent HTTP client. Standard private preview URLs with
server-held authentication on ports80/3000 received `ticket.updated` in about
2seconds. The initial signed-browser event observations were therefore not
sufficient proof of uninterrupted live delivery. Local SSH forwarding is only
a diagnostic acceptance path, not a repair/pass claim for signed-preview SSE.
No broad provider token is sent to the browser, no proxy guard is relaxed, and
no polling/local callback workaround hides the unresolved transport failure.
2026-11-03 runtime: signed preview login200, projects/dashboard200, host-only
HttpOnly+Secure session, reload preserved login; create/label/status/comment
verified through the browser. Unsigned provider preview and the local branded
proxy both returned401. The signed provider URL uses its own temporary alias;
its working host is part of the signed capability and is not an anonymous
preview test. ACE proxy26 tests and build passed without source changes. Rollback must restore Next routing and
sandbox API/cookie settings together; restart the frontend after configuration
changes and sign in again. Runtime evidence predates PR publication; deployment remains a separate step.


## Review validation — 2026-11-03

The preview/setup delivery branch is `feat/zng-public-google-signup`, targeting
`main` from `14853be`. The code tested here is the setup/preview repair; the
separate sandbox-generated ticket-count story is not in this checkout or PR.
The existing owning routes, Next configuration, setup helper and their earlier
CodeMaps were reused; the main branch and functional file hashes were unchanged
at publication preparation. No new architecture or application dependency was
added for delivery.

Publication checks: backend event/dashboard routes 13 tests passed; frontend
39 files/277 tests passed; both production builds, frontend lint, changed backend
production/new-test lint, shell syntax and `git diff --check` passed. On Node26,
frontend tests require `NODE_OPTIONS=--no-experimental-webstorage`; without it,
13 existing sidebar tests fail on unavailable localStorage. This is a runner
compatibility setting, not an application behavior change.

Standalone frontend typecheck retains four errors in the unchanged
`create-ticket-dialog.test.tsx`; backend global lint retains pre-existing test
violations, including the dashboard test's `@ts-nocheck`. Full backend database
integration tests were not repeated for publication; earlier full-suite runs
were intermittent on both the baseline and changed sandbox revision. The
focused HTTP-stream tests use ephemeral loopback servers and close them.

The remaining managed signed-preview SSE limitation above is still open.
Reverting the PR does not repair old sandbox state or restore a prior runtime
session; use the coordinated configuration rollback described above. No
production mutation, merge, deployment or sandbox deletion is part of PR creation.
