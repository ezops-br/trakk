#!/bin/bash
set -euo pipefail

# Brings up the local dev stack (docker-compose.yml) with the fixed
# localhost URLs it needs. Counterpart to fresh-setup.sh, which does the same
# job for an ephemeral sandbox but computes its URLs from the sandbox
# hostname instead of hardcoding localhost — same compose file, different
# script per environment.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
ENV_FILE="$REPO_ROOT/.env"
PROJECT_NAME="trakk-issue-tracker"

FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost"

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

check_prereqs() {
  log_section "PRE-FLIGHT CHECKS"

  if [ ! -f "$ENV_FILE" ]; then
    log "❌ $ENV_FILE not found."
    exit 1
  fi

  log "✅ Prerequisites OK."
}

rotate_jwt_secret() {
  log_section "ROTATING JWT_SECRET"

  local new_secret
  new_secret="$(openssl rand -hex 32)"

  if grep -q "^JWT_SECRET=" "$ENV_FILE"; then
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${new_secret}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    echo "JWT_SECRET=${new_secret}" >> "$ENV_FILE"
  fi

  log "✅ JWT_SECRET regenerated (existing sessions will need to log in again)."
}

down_stack() {
  log_section "STOPPING EXISTING STACK"
  compose down -v
}

up_stack() {
  log_section "BUILDING AND STARTING STACK"
  compose up -d --build
}

wait_for_stack() {
  log_section "WAITING FOR STACK TO BE READY"

  local max_attempts=90
  local attempt=1

  log "⏳ Waiting for backend... (${BACKEND_URL}/api/v1/health)"
  while [ $attempt -le $max_attempts ]; do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "${BACKEND_URL}/api/v1/health" 2>/dev/null)" = "200" ]; then
      log "✅ Backend ready!"
      break
    fi
    if [ $attempt -eq $max_attempts ]; then
      log "❌ Backend not ready after ${max_attempts}s."
      compose logs backend
      exit 1
    fi
    sleep 1
    attempt=$((attempt + 1))
  done

  attempt=1
  log "⏳ Waiting for frontend... (${FRONTEND_URL}/)"
  while [ $attempt -le $max_attempts ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 5 "${FRONTEND_URL}/" 2>/dev/null) || HTTP_CODE="000"
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

  # down_stack wipes the DB volume (-v) on every run, so there is no
  # login-able user until this runs.
  compose exec -T backend npx prisma db seed
  log "✅ Database seeded."
}

finish() {
  log_section "DONE"
  log "🌐 Frontend: $FRONTEND_URL"
  log "🌐 Backend:  $BACKEND_URL"
}

main() {
  check_prereqs
  rotate_jwt_secret
  down_stack
  up_stack
  wait_for_stack
  seed_database
  finish
}

main "$@"
