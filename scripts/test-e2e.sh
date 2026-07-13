#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

started_postgres=0
temporary_storage=""
temporary_static=""
compose=(docker compose -p my-telegram-gallery-e2e -f compose.test.yml)

cleanup() {
  if [[ "$started_postgres" -eq 1 ]]; then
    "${compose[@]}" down -v --remove-orphans
  fi
  if [[ -n "$temporary_storage" ]]; then
    rm -rf "$temporary_storage"
  fi
  if [[ -n "$temporary_static" ]]; then
    rm -rf "$temporary_static"
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
export TELEGRAM_BOT_USERNAME="${TELEGRAM_BOT_USERNAME:-test_gallery_bot}"
export TELEGRAM_ADMIN_APP_SHORT_NAME="${TELEGRAM_ADMIN_APP_SHORT_NAME:-admin_app}"
export TELEGRAM_GALLERY_APP_SHORT_NAME="${TELEGRAM_GALLERY_APP_SHORT_NAME:-gallery_app}"
export ADMIN_TG_IDS="${ADMIN_TG_IDS:-1,2}"
export TELEGRAM_INIT_DATA_MAX_AGE_SECONDS="${TELEGRAM_INIT_DATA_MAX_AGE_SECONDS:-3600}"
export STORAGE_DRIVER="${STORAGE_DRIVER:-filesystem}"
export STORAGE_TRANSFER_MODE="${STORAGE_TRANSFER_MODE:-proxy}"
if [[ "$STORAGE_DRIVER" == "filesystem" && -z "${FILESYSTEM_STORAGE_PATH:-}" ]]; then
  temporary_storage="$(mktemp -d)"
  export FILESYSTEM_STORAGE_PATH="$temporary_storage"
fi
export UPLOAD_MAX_BYTES="${UPLOAD_MAX_BYTES:-1048576}"
export UPLOAD_INTENT_TTL_SECONDS="${UPLOAD_INTENT_TTL_SECONDS:-600}"
export MEDIA_URL_SIGNING_SECRET="${MEDIA_URL_SIGNING_SECRET:-test-media-signing-secret-32-bytes-long}"
export MEDIA_URL_TTL_SECONDS="${MEDIA_URL_TTL_SECONDS:-3600}"
export WEB_ORIGINS="${WEB_ORIGINS:-}"
if [[ -z "${STATIC_ROOT:-}" ]]; then
  temporary_static="$(mktemp -d)"
  mkdir -p "$temporary_static/gallery" "$temporary_static/admin"
  printf '<!doctype html><title>Gallery fixture</title><main>gallery-static</main>\n' > "$temporary_static/gallery/index.html"
  printf '<!doctype html><title>Admin fixture</title><main>admin-static</main>\n' > "$temporary_static/admin/index.html"
  export STATIC_ROOT="$temporary_static"
fi
export NODE_ENV="test"
export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--experimental-vm-modules"

bash scripts/e2e-db-prepare.sh
pnpm --filter api test:e2e --runInBand
