#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-trakk}"
DB_NAME="${DB_NAME:-trakk}"

echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."

until PGPASSWORD="${DB_PASSWORD:-trakk_dev}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -c "SELECT 1" > /dev/null 2>&1; do
  sleep 1
done

echo "Database ${DB_NAME} is ready."
