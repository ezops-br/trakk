#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-trakk}"
DB_NAME="${DB_NAME:-trakk}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/trakk-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/trakk_${TIMESTAMP}.sql"

mkdir -p "${BACKUP_DIR}"

echo "Backing up ${DB_NAME} to ${BACKUP_FILE}..."

PGPASSWORD="${DB_PASSWORD:-trakk_dev}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-acl \
  -f "${BACKUP_FILE}"

echo "Backup complete: ${BACKUP_FILE}"
