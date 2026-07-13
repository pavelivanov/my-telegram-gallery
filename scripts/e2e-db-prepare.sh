#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_HOST="${E2E_DB_HOST:-127.0.0.1}"
DB_PORT="${E2E_DB_PORT:-55432}"
DATABASE_URL="${E2E_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:55432/gallery_e2e?schema=public}"

echo "Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."

ready=0
for _ in $(seq 1 60); do
  if node -e "const net=require('net'); const socket=net.createConnection({host: process.argv[1], port: Number(process.argv[2])},()=>{socket.end(); process.exit(0)}); socket.on('error',()=>process.exit(1)); setTimeout(()=>process.exit(1),500);" "$DB_HOST" "$DB_PORT"; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "Database is not reachable at ${DB_HOST}:${DB_PORT}" >&2
  exit 1
fi

execute_sql() {
  DATABASE_URL="$DATABASE_URL" pnpm --filter api exec prisma db execute --file "$1"
}

legacy_migrations=(
  "$ROOT_DIR/apps/api/prisma/migrations/0_init/migration.sql"
  "$ROOT_DIR/apps/api/prisma/migrations/1_global_gallery/migration.sql"
  "$ROOT_DIR/apps/api/prisma/migrations/2_albums/migration.sql"
  "$ROOT_DIR/apps/api/prisma/migrations/3_photo_position/migration.sql"
  "$ROOT_DIR/apps/api/prisma/migrations/4_photo_thumb/migration.sql"
  "$ROOT_DIR/apps/api/prisma/migrations/5_photo_preview/migration.sql"
  "$ROOT_DIR/apps/api/prisma/migrations/6_upload_intents/migration.sql"
)
tenant_migration="$ROOT_DIR/apps/api/prisma/migrations/7_tenant_core/migration.sql"
guardrails_migration="$ROOT_DIR/apps/api/prisma/migrations/8_saas_guardrails/migration.sql"
fixture_dir="$ROOT_DIR/apps/api/test/fixtures"

rehearse_tenant_migration() {
  local fixture="${1:-}"
  local verification="$2"

  execute_sql "$fixture_dir/reset-schema.sql"
  for migration in "${legacy_migrations[@]}"; do
    execute_sql "$migration"
  done
  if [[ -n "$fixture" ]]; then
    execute_sql "$fixture"
  fi
  execute_sql "$tenant_migration"
  execute_sql "$verification"
}

echo "Rehearsing the tenant migration on an empty legacy database..."
rehearse_tenant_migration "" "$fixture_dir/tenant-migration-empty-verify.sql"

echo "Rehearsing the tenant migration on a populated legacy database..."
rehearse_tenant_migration \
  "$fixture_dir/tenant-migration-populated.sql" \
  "$fixture_dir/tenant-migration-populated-verify.sql"

echo "Rehearsing the guardrails migration on the populated tenant fixture..."
execute_sql "$guardrails_migration"
execute_sql "$fixture_dir/guardrails-migration-populated-verify.sql"

echo "Resetting Prisma schema via recorded migrations..."
# E2E wants a clean DB every run. `migrate reset` drops the database, re-applies
# all migrations, and keeps the schema in sync with what runs in production.
# Run inside apps/api so the Prisma 7 CLI picks up prisma.config.ts (which reads
# DATABASE_URL from the environment).
DATABASE_URL="$DATABASE_URL" pnpm --filter api exec prisma migrate reset --force
