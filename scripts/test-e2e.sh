#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

started_postgres=0
compose=(docker compose -p my-telegram-gallery-e2e -f compose.test.yml)

cleanup() {
  if [[ "$started_postgres" -eq 1 ]]; then
    "${compose[@]}" down -v --remove-orphans
  fi
}
trap cleanup EXIT

if [[ -z "${E2E_DATABASE_URL:-}" ]]; then
  started_postgres=1
  "${compose[@]}" up -d --wait
  postgres_address="$("${compose[@]}" port postgres 5432)"
  postgres_port="${postgres_address##*:}"
  export E2E_DB_HOST="127.0.0.1"
  export E2E_DB_PORT="$postgres_port"
  export E2E_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${postgres_port}/gallery_e2e?schema=public"
fi

export DATABASE_URL="$E2E_DATABASE_URL"
export TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-123456:test-only-token}"
export ADMIN_TG_IDS="${ADMIN_TG_IDS:-1,2}"
export TELEGRAM_INIT_DATA_MAX_AGE_SECONDS="${TELEGRAM_INIT_DATA_MAX_AGE_SECONDS:-3600}"
export R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-test-account}"
export R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-test-access-key}"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-test-secret-key}"
export R2_BUCKET="${R2_BUCKET:-test-bucket}"
export WEB_ORIGINS="${WEB_ORIGINS:-}"
export NODE_ENV="test"
export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--experimental-vm-modules"

bash scripts/e2e-db-prepare.sh
pnpm --filter api test:e2e --runInBand
