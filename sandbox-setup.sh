#!/bin/bash
set -euo pipefail

# Brings up the same stack as local-setup.sh (docker-compose.yml), but
# for an ephemeral Daytona sandbox instead of a developer's own machine.
#
# Unlike local-setup.sh's static prod.env, and unlike the old version of
# this script, .env is NOT built by calling AWS Secrets Manager on every
# run. Instead:
#   1. .env.sandbox (committed to the repo — see its own header) already has
#      the non-secret trakk/prod/backend + trakk/prod/frontend values baked
#      in, plus the fixed sandbox overrides (blank S3, local DATABASE_URL,
#      DISABLE_APP_CORS, etc.) — a snapshot taken by hand, not fetched live.
#   2. This script fills in the __FRONTEND_URL__/__BACKEND_URL__/
#      __COOKIE_DOMAIN__ placeholders in .env.sandbox, computed from this
#      sandbox's own hostname (compute_urls()) — the one part that can't be
#      static, since every new sandbox gets a different UUID. Same
#      port-prefixed-subdomain pattern fresh-setup.sh uses for a sibling
#      project (https://<port>-<uuid>.<domain>). It also fills in
#      __JWT_SECRET__ with a freshly generated value every run (same
#      rotate-on-boot approach as local-setup.sh) — .env.sandbox never holds
#      a live secret.
#   3. The result is written to .env (gitignored, regenerated every run —
#      never commit it; .env.sandbox is the one that IS committed).
#
# To pick up a changed non-secret config value, hand-edit .env.sandbox (see
# its header) — there is no "re-fetch from AWS" step anymore.
#
# Since the DB is a fresh volume on every sandbox boot, this script also
# runs prisma/seed.ts once the backend is healthy — otherwise the sandbox
# comes up with no login-able user (see seed_database()).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_TEMPLATE="$REPO_ROOT/.env.sandbox"
ENV_FILE="$REPO_ROOT/.env"
PROJECT_NAME="trakk-issue-tracker"

SANDBOX_DOMAIN="${SANDBOX_DOMAIN:-sandbox.acedev.ai}"

timestamp() {
  date +"[%Y-%m-%d %H:%M:%S]"
}

log() {
  echo "$(timestamp) $*"
}

log_section() {
  echo ""
  echo "==========================================="
  echo "$(timestamp) $*"
  echo "==========================================="
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" -p "$PROJECT_NAME" "$@"
}

# ============================================================
# Start the Docker daemon — a fresh sandbox doesn't have it running yet
# (same dockerd invocation as the sibling project's fresh-setup.sh)
# ============================================================
docker_init() {
  log_section "DOCKER INITIALIZATION"

  if docker info >/dev/null 2>&1; then
    log "✅ Docker daemon already running."
    return 0
  fi

  if ! command -v dockerd >/dev/null 2>&1; then
    log "❌ dockerd not found."
    exit 1
  fi

  log "🚀 Starting Docker daemon..."
  dockerd --host=unix:///var/run/docker.sock --host=tcp://0.0.0.0:2376 --tls=false >>/tmp/trakk-dockerd.log 2>&1 &
  DOCKER_PID=$!
  log "➡️  Docker PID: $DOCKER_PID"

  local max_attempts=15
  local attempt=1
  local wait_interval=0.5
  while [ $attempt -le $max_attempts ]; do
    if docker info >/dev/null 2>&1; then
      log "✅ Docker is ready!"
      return 0
    fi
    if [ $((attempt % 4)) -eq 0 ]; then
      log "⏳ Docker still initializing (attempt $attempt/$max_attempts)..."
    fi
    sleep $wait_interval
    attempt=$((attempt + 1))
  done

  log "❌ Docker failed to initialize after ${max_attempts} attempts."
  log "❌ Check logs at: /tmp/trakk-dockerd.log"
  exit 1
}

# ============================================================
# Confirm the committed template is present before doing anything else
# ============================================================
check_env_template() {
  log_section "ENV TEMPLATE CHECK"

  if [ ! -f "$ENV_TEMPLATE" ]; then
    log "❌ $ENV_TEMPLATE not found. This file is committed to the repo — did you check out the right branch?"
    exit 1
  fi

  log "✅ Found .env.sandbox."
}

# ============================================================
# Compute this sandbox's own public URLs from its hostname
# ============================================================
compute_urls() {
  SANDBOX_UUID="$(hostname)"
  if [ -z "$SANDBOX_UUID" ]; then
    log "❌ Failed to read hostname for this sandbox."
    exit 1
  fi

  # Frontend on :3000, backend on :80 — same port-prefixed-subdomain pattern
  # as fresh-setup.sh (https://<port>-<uuid>.<domain>).
  FRONTEND_URL="https://3000-${SANDBOX_UUID}.${SANDBOX_DOMAIN}"
  BACKEND_URL="https://80-${SANDBOX_UUID}.${SANDBOX_DOMAIN}"

  log "✅ Sandbox URLs computed:"
  log "   Frontend: $FRONTEND_URL"
  log "   Backend:  $BACKEND_URL"
}

# ============================================================
# Render .env.sandbox -> .env, filling in the per-sandbox URL placeholders
# ============================================================
render_env() {
  log_section "RENDERING .env FROM .env.sandbox"

  local jwt_secret
  jwt_secret="$(openssl rand -hex 32)"

  # sed delimiter is | (not /) since the replacement values are URLs.
  sed \
    -e "s|__FRONTEND_URL__|${FRONTEND_URL}|g" \
    -e "s|__BACKEND_URL__|${BACKEND_URL}|g" \
    -e "s|__COOKIE_DOMAIN__|.${SANDBOX_DOMAIN}|g" \
    -e "s|__JWT_SECRET__|${jwt_secret}|g" \
    "$ENV_TEMPLATE" > "$ENV_FILE"

  chmod 600 "$ENV_FILE"

  log "✅ .env written ($(grep -vc '^#' "$ENV_FILE" | tr -d ' ') vars), JWT_SECRET freshly generated."
}

down_stack() {
  log_section "STOPPING EXISTING STACK"
  compose down
}

# ============================================================
# Pre-pull the two images this stack actually pulls from a registry, before
# `compose up`: postgres:16-alpine (the db service) and node:20-alpine (the
# base image backend/frontend/migrate all build FROM — not visible to
# `compose config --images`, which only lists postgres since the others are
# `build:` services, not `image:` ones).
#
# The sandbox's outbound network proxy intermittently 502s on Docker Hub —
# confirmed transient (retrying the same pull a few seconds later succeeds)
# rather than a real connectivity problem — so a bounded retry loop is
# enough, with an outer round of retries in case a whole 10-attempt burst
# lands in a longer blip. Skips anything already present locally so a
# re-run of this script after a successful boot doesn't hit the network.
# ============================================================
PULL_IMAGES=("postgres:16-alpine" "node:20-alpine")

# Each image runs its own fully independent retry cycle — postgres finishing
# (or exhausting its rounds) never blocks or shares a wait with node, and
# vice versa.
pull_one_image() {
  local image="$1"
  local max_attempts=10
  local max_rounds=3

  if docker image inspect "$image" >/dev/null 2>&1; then
    log "✅ $image already present locally, skipping."
    return 0
  fi

  local round=1
  while [ $round -le $max_rounds ]; do
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
      log "⏳ Pulling $image (round $round/$max_rounds, attempt $attempt/$max_attempts)..."
      if docker pull "$image" >/dev/null 2>&1; then
        log "✅ Pulled $image."
        return 0
      fi
      sleep 3
      attempt=$((attempt + 1))
    done

    if [ $round -eq $max_rounds ]; then
      log "❌ Failed to pull $image after ${max_rounds} rounds of ${max_attempts} attempts each."
      return 1
    fi

    log "⏳ $image still missing after ${max_attempts} attempts — waiting 30s before round $((round + 1))/${max_rounds}..."
    sleep 30
    round=$((round + 1))
  done

  return 1
}

pull_images() {
  log_section "PRE-PULLING IMAGES"

  local image
  for image in "${PULL_IMAGES[@]}"; do
    pull_one_image "$image" || exit 1
  done
}

up_stack() {
  log_section "BUILDING AND STARTING STACK"
  compose up -d --build
}

wait_for_stack() {
  log_section "WAITING FOR STACK TO BE READY"

  local max_attempts=90
  local attempt=1

  # Checked via localhost, not the public sandbox URL: the Daytona ingress
  # proxy in front of the public hostname gates unauthenticated requests
  # with its own 401 (confirmed against a real sandbox — curl got 401 here
  # while a logged-in browser hit the same public URL and got a real 200
  # with the health JSON), so it can't be used as a readiness signal from
  # a plain curl. localhost bypasses that proxy entirely since the compose
  # file publishes these ports directly on the sandbox host.
  log "⏳ Waiting for backend... (http://localhost:80/api/v1/health)"
  while [ $attempt -le $max_attempts ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:80/api/v1/health" 2>/dev/null) || HTTP_CODE="000"
    if [ "$HTTP_CODE" = "200" ]; then
      log "✅ Backend ready!"
      break
    fi
    if [ $attempt -eq $max_attempts ]; then
      log "❌ Backend not ready after ${max_attempts}s (last HTTP code: $HTTP_CODE)."
      compose logs backend
      exit 1
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  attempt=1
  log "⏳ Waiting for frontend... (http://localhost:3000/)"
  while [ $attempt -le $max_attempts ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 5 "http://localhost:3000/" 2>/dev/null) || HTTP_CODE="000"
    if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" != "502" ] && [ "$HTTP_CODE" != "503" ] && [ "$HTTP_CODE" != "504" ]; then
      log "✅ Frontend ready! (HTTP $HTTP_CODE)"
      break
    fi
    if [ $attempt -eq $max_attempts ]; then
      log "❌ Frontend not ready after ${max_attempts}s."
      compose logs frontend
      exit 1
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
}

seed_database() {
  log_section "SEEDING DATABASE"

  # Every sandbox boot is a fresh Postgres volume — without this there is no
  # login-able user (unlike a developer's own machine, where the DB usually
  # already has seed data from a previous run).
  compose exec -T backend npx prisma db seed
  log "✅ Database seeded."
}

finish() {
  log_section "DONE"
  log "🌐 Frontend: $FRONTEND_URL"
  log "🌐 Backend:  $BACKEND_URL"
}

main() {
  docker_init
  check_env_template
  compute_urls
  render_env
  down_stack
  pull_images
  up_stack
  wait_for_stack
  seed_database
  finish
}

main "$@"
