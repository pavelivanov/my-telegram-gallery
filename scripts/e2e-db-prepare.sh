#!/usr/bin/env bash
set -euo pipefail

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

echo "Resetting Prisma schema via migrations..."
# E2E wants a clean DB every run. `migrate reset` drops the database, re-applies
# all migrations, and keeps the schema in sync with what runs in production.
# Run inside apps/api so the Prisma 7 CLI picks up prisma.config.ts (which reads
# DATABASE_URL from the environment).
DATABASE_URL="$DATABASE_URL" pnpm --filter api exec prisma migrate reset --force
