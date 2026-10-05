#!/bin/bash
set -euo pipefail

# Brings up the same three parts as local-setup.sh (PostgreSQL, backend,
# frontend) inside an ephemeral Daytona sandbox — but WITHOUT Docker.
#
# The sandbox has no root: the agent and every project member are ordinary
# Linux users, and dockerd refuses to start without root ("dockerd needs to be
# started with root privileges"). Rootless Docker is no way out either: the
# sandbox host restricts unprivileged user namespaces, which it needs (checked
# 2026-10-05: writing uid_map fails with EPERM). So this script runs the stack
# as plain processes of whoever calls it, with the tools pinned in devbox.json
# (Node.js 22, PostgreSQL 16) and installed through Devbox/Nix, which the
# sandbox image ships.
#
# .env is NOT built by calling AWS Secrets Manager on every run. Instead:
#   1. .env.sandbox (committed to the repo — see its own header) already has
#      the non-secret trakk/prod/backend + trakk/prod/frontend values baked
#      in, plus the fixed sandbox overrides (blank S3, local DATABASE_URL,
#      DISABLE_APP_CORS, etc.) — a snapshot taken by hand, not fetched live.
#   2. This script fills in the __FRONTEND_URL__/__BACKEND_URL__/
#      __COOKIE_DOMAIN__ placeholders in .env.sandbox, computed from this
#      sandbox's own id (compute_urls()) — the one part that can't be static,
#      since every new sandbox gets a different UUID
#      (<scheme>://<port>-<uuid>.<domain>). It also fills in the ports and
#      __JWT_SECRET__ with a freshly generated value every run (same
#      rotate-on-boot approach as local-setup.sh) — .env.sandbox never holds
#      a live secret.
#   3. The result is written to .env (gitignored, regenerated every run —
#      never commit it; .env.sandbox is the one that IS committed).
#
# To pick up a changed non-secret config value, hand-edit .env.sandbox (see
# its header) — there is no "re-fetch from AWS" step anymore.
#
# Database, logs and process ids live in a per-user state directory
# (STATE_DIR below), not in the checkout: the agent and each member are
# different Linux users sharing this checkout, and PostgreSQL refuses a data
# directory owned by another user. The database survives re-runs; the seed
# runs only when the database is created, since prisma/seed.ts is not
# idempotent (re-running it duplicates the demo board).
#
# Defaults match the URLs of the hosted sandboxes. Override them with env vars:
#   SANDBOX_DOMAIN  preview domain, may include a port (default sandbox.acedev.ai)
#   SANDBOX_SCHEME  preview scheme (default https)
#   FRONTEND_PORT / BACKEND_PORT / DB_PORT  (default 3000 / 80 / 5432)
# e.g. a local ACE stack:
#   SANDBOX_SCHEME=http SANDBOX_DOMAIN=daytona.<stack>.localhost:<port> ./sandbox-setup.sh

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_TEMPLATE="$REPO_ROOT/.env.sandbox"
ENV_FILE="$REPO_ROOT/.env"

SANDBOX_DOMAIN="${SANDBOX_DOMAIN:-sandbox.acedev.ai}"
SANDBOX_SCHEME="${SANDBOX_SCHEME:-https}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-80}"
DB_PORT="${DB_PORT:-5432}"

STATE_DIR="${TRAKK_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/trakk-sandbox}"
PGDATA="$STATE_DIR/postgres"
LOG_DIR="$STATE_DIR/logs"
DB_CREATED=0

# The checkout is shared with the sandboxusers group (agent + members); keep
# what this script creates in it (.devbox, node_modules) group-writable.
umask 002

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

# Last value of KEY in the rendered .env.
env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

port_in_use() {
  ss -ltnH "sport = :$1" 2>/dev/null | grep -q .
}

require_free_port() {
  if port_in_use "$1"; then
    log "❌ Port $1 ($2) is already in use by another process — maybe another user's stack in this sandbox."
    log "   Stop it, or pick another port with $3=<port>."
    exit 1
  fi
}

# ============================================================
# Install the tools pinned in devbox.json and put them on PATH
# ============================================================
devbox_init() {
  log_section "TOOLS (DEVBOX)"

  if ! command -v devbox >/dev/null 2>&1; then
    log "❌ devbox not found. This script expects the ACE sandbox image, which ships Devbox and Nix."
    exit 1
  fi

  cd "$REPO_ROOT"
  # ACE prepares this repository's Devbox environment and publishes it for
  # people as .devbox/ace-shellenv.sh. Use it as is: `devbox install` would
  # rewrite .devbox, which belongs to whoever prepared it, and Devbox creates
  # parts of it without group write, so another sandbox user cannot.
  if [ -s "$REPO_ROOT/.devbox/ace-shellenv.sh" ]; then
    log "✅ Using the environment ACE prepared (.devbox/ace-shellenv.sh)."
    # shellcheck disable=SC1091
    . "$REPO_ROOT/.devbox/ace-shellenv.sh"
  else
    log "⏳ devbox install (fast when the Nix store already has the packages)..."
    devbox install
    eval "$(devbox shellenv)"
  fi

  local tool
  for tool in node npm initdb pg_ctl psql; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      log "❌ $tool not on PATH after loading the Devbox environment."
      exit 1
    fi
  done
  log "✅ Node $(node --version), $(postgres --version)."
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
# Compute this sandbox's own public URLs from its id
# ============================================================
compute_urls() {
  SANDBOX_UUID="${DAYTONA_SANDBOX_ID:-$(hostname)}"
  if [ -z "$SANDBOX_UUID" ]; then
    log "❌ Failed to read this sandbox's id (DAYTONA_SANDBOX_ID or hostname)."
    exit 1
  fi

  FRONTEND_URL="${SANDBOX_SCHEME}://${FRONTEND_PORT}-${SANDBOX_UUID}.${SANDBOX_DOMAIN}"
  BACKEND_URL="${SANDBOX_SCHEME}://${BACKEND_PORT}-${SANDBOX_UUID}.${SANDBOX_DOMAIN}"
  # A cookie Domain never carries a port.
  COOKIE_DOMAIN=".${SANDBOX_DOMAIN%%:*}"

  log "✅ Sandbox URLs computed:"
  log "   Frontend: $FRONTEND_URL"
  log "   Backend:  $BACKEND_URL"
}

# ============================================================
# Render .env.sandbox -> .env, filling in the per-sandbox placeholders
# ============================================================
render_env() {
  log_section "RENDERING .env FROM .env.sandbox"

  local jwt_secret
  jwt_secret="$(openssl rand -hex 32)"

  # sed delimiter is | (not /) since the replacement values are URLs.
  sed \
    -e "s|__FRONTEND_URL__|${FRONTEND_URL}|g" \
    -e "s|__BACKEND_URL__|${BACKEND_URL}|g" \
    -e "s|__COOKIE_DOMAIN__|${COOKIE_DOMAIN}|g" \
    -e "s|__BACKEND_PORT__|${BACKEND_PORT}|g" \
    -e "s|__DB_PORT__|${DB_PORT}|g" \
    -e "s|__JWT_SECRET__|${jwt_secret}|g" \
    "$ENV_TEMPLATE" > "$ENV_FILE"

  chmod 600 "$ENV_FILE"

  log "✅ .env written ($(grep -vc '^#' "$ENV_FILE" | tr -d ' ') vars), JWT_SECRET freshly generated."
}

# ============================================================
# Stop what a previous run of this script started (this user's only)
# ============================================================
stop_service() {
  local name="$1"
  local pid_file="$STATE_DIR/$name.pid"
  [ -f "$pid_file" ] || return 0

  local pid
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    log "⏹  Stopping previous $name (process group $pid)..."
    kill -TERM -- "-$pid" 2>/dev/null || true
    local i
    for i in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL -- "-$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
}

stop_stack() {
  log_section "STOPPING EXISTING STACK"

  mkdir -p -m 700 "$STATE_DIR"
  mkdir -p "$LOG_DIR"

  stop_service frontend
  stop_service backend
  if [ -s "$PGDATA/PG_VERSION" ] && LC_ALL=C pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    log "⏹  Stopping previous PostgreSQL..."
    LC_ALL=C pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null
  fi
  log "✅ Nothing of this user's stack is running."
}

# ============================================================
# npm dependencies — skipped when node_modules matches the lockfile
# ============================================================
install_dependencies() {
  log_section "INSTALLING NPM DEPENDENCIES"

  local dir
  for dir in backend frontend; do
    if [ -f "$REPO_ROOT/$dir/node_modules/.package-lock.json" ] \
      && [ "$REPO_ROOT/$dir/node_modules/.package-lock.json" -nt "$REPO_ROOT/$dir/package-lock.json" ]; then
      log "✅ $dir/node_modules is up to date, skipping."
      continue
    fi
    log "⏳ npm ci in $dir..."
    (cd "$REPO_ROOT/$dir" && npm ci --no-audit --no-fund)
    log "✅ $dir dependencies installed."
  done

  (cd "$REPO_ROOT/backend" && npx prisma generate >/dev/null)
  log "✅ Prisma client generated."
}

# ============================================================
# PostgreSQL as this user, on 127.0.0.1 only
#
# PostgreSQL commands run with LC_ALL=C: Nix's binaries can't load the
# system's locales (initdb fails on en_US.UTF-8), and the cluster uses the C
# locale with UTF8 encoding — the same sort order the old postgres:16-alpine
# container had, since musl has no locale collation.
# ============================================================
psql_admin() {
  LC_ALL=C psql -h "$STATE_DIR" -p "$DB_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -tAq "$@"
}

start_database() {
  log_section "STARTING POSTGRESQL"

  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    log "🆕 Initializing a database cluster in $PGDATA..."
    # Admin access only through the socket in STATE_DIR (0700, this user);
    # TCP clients — the app — need the password from .env.
    if ! LC_ALL=C initdb -D "$PGDATA" -U postgres -E UTF8 --no-locale \
      --auth-local=trust --auth-host=scram-sha-256 >"$LOG_DIR/initdb.log" 2>&1; then
      log "❌ initdb failed:"
      tail -n 20 "$LOG_DIR/initdb.log"
      exit 1
    fi
  fi

  require_free_port "$DB_PORT" "PostgreSQL" DB_PORT
  if ! LC_ALL=C pg_ctl -D "$PGDATA" -l "$LOG_DIR/postgres.log" -w -t 60 \
    -o "-p $DB_PORT -k $STATE_DIR -c listen_addresses=127.0.0.1" start >/dev/null; then
    log "❌ PostgreSQL did not start:"
    tail -n 20 "$LOG_DIR/postgres.log"
    exit 1
  fi

  local db_user db_password db_name
  db_user="$(env_value POSTGRES_USER)"
  db_password="$(env_value POSTGRES_PASSWORD)"
  db_name="$(env_value POSTGRES_DB)"

  if [ "$(psql_admin -c "SELECT 1 FROM pg_roles WHERE rolname = '$db_user'")" != "1" ]; then
    psql_admin -c "CREATE ROLE \"$db_user\" LOGIN CREATEDB PASSWORD '$db_password'"
  fi
  if [ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$db_name'")" != "1" ]; then
    psql_admin -c "CREATE DATABASE \"$db_name\" OWNER \"$db_user\""
    DB_CREATED=1
    log "🆕 Database $db_name created."
  fi
  log "✅ PostgreSQL ready on 127.0.0.1:$DB_PORT."
}

# Backend and Prisma read every variable of .env; the frontend gets only its
# two (below), so backend-only secrets (JWT_SECRET, DATABASE_URL, …) and
# NODE_ENV=production never reach `next dev` — same split as the old compose
# file's frontend service.
load_env_file() {
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

migrate_database() {
  log_section "APPLYING MIGRATIONS"
  (cd "$REPO_ROOT/backend" && load_env_file && npx prisma migrate deploy)
  log "✅ Migrations applied."
}

# Detached from this terminal (setsid + nohup): the stack keeps running after
# the terminal that started it closes. The pid file holds the process group.
start_service() {
  local name="$1"
  shift
  local log_file="$LOG_DIR/$name.log"
  : > "$log_file"
  setsid nohup "$@" >>"$log_file" 2>&1 < /dev/null &
  echo "$!" > "$STATE_DIR/$name.pid"
  log "➡️  $name PID: $! (log: $log_file)"
}

start_app() {
  log_section "STARTING BACKEND AND FRONTEND"

  require_free_port "$BACKEND_PORT" "backend" BACKEND_PORT
  require_free_port "$FRONTEND_PORT" "frontend" FRONTEND_PORT

  (cd "$REPO_ROOT/backend" && load_env_file && start_service backend npm run dev)

  local next_public_api_url internal_api_url
  next_public_api_url="$(env_value NEXT_PUBLIC_API_URL)"
  internal_api_url="$(env_value INTERNAL_API_URL)"
  (cd "$REPO_ROOT/frontend" \
    && export NEXT_PUBLIC_API_URL="$next_public_api_url" INTERNAL_API_URL="$internal_api_url" \
    && start_service frontend npm run dev -- -p "$FRONTEND_PORT")
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
  # a plain curl.
  log "⏳ Waiting for backend... (http://localhost:$BACKEND_PORT/api/v1/health)"
  while [ $attempt -le $max_attempts ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:$BACKEND_PORT/api/v1/health" 2>/dev/null) || HTTP_CODE="000"
    if [ "$HTTP_CODE" = "200" ]; then
      log "✅ Backend ready!"
      break
    fi
    if [ $attempt -eq $max_attempts ]; then
      log "❌ Backend not ready after ${max_attempts}s (last HTTP code: $HTTP_CODE)."
      tail -n 40 "$LOG_DIR/backend.log"
      exit 1
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  attempt=1
  log "⏳ Waiting for frontend... (http://localhost:$FRONTEND_PORT/)"
  while [ $attempt -le $max_attempts ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 5 "http://localhost:$FRONTEND_PORT/" 2>/dev/null) || HTTP_CODE="000"
    if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" != "502" ] && [ "$HTTP_CODE" != "503" ] && [ "$HTTP_CODE" != "504" ]; then
      log "✅ Frontend ready! (HTTP $HTTP_CODE)"
      break
    fi
    if [ $attempt -eq $max_attempts ]; then
      log "❌ Frontend not ready after ${max_attempts}s."
      tail -n 40 "$LOG_DIR/frontend.log"
      exit 1
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
}

seed_database() {
  log_section "SEEDING DATABASE"

  if [ "$DB_CREATED" != "1" ]; then
    log "✅ Existing database kept, seed skipped (it already ran when the database was created)."
    return 0
  fi

  # A new database has no login-able user without this.
  (cd "$REPO_ROOT/backend" && load_env_file && npx prisma db seed)
  log "✅ Database seeded."
}

finish() {
  log_section "DONE"
  log "🌐 Frontend: $FRONTEND_URL"
  log "🌐 Backend:  $BACKEND_URL"
  log "📄 Logs:     $LOG_DIR"
}

main() {
  devbox_init
  check_env_template
  compute_urls
  render_env
  stop_stack
  install_dependencies
  start_database
  migrate_database
  start_app
  wait_for_stack
  seed_database
  finish
}

main "$@"
