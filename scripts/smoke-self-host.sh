#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="my-telegram-gallery-smoke-${RANDOM}-$$"
TEMP_DIR="$(mktemp -d)"
ENV_FILE="$TEMP_DIR/.env"
IMAGE="${SMOKE_IMAGE:-my-telegram-gallery:smoke}"
BUILD_IMAGE="${SMOKE_BUILD:-true}"
compose_files=(--file "$ROOT_DIR/docker-compose.yml")
if [[ -n "${SMOKE_PLATFORM:-}" ]]; then
  if [[ ! "$SMOKE_PLATFORM" =~ ^linux/[a-z0-9_./-]+$ ]]; then
    echo "SMOKE_PLATFORM must be a Linux Docker platform." >&2
    exit 1
  fi
  export APP_PLATFORM="$SMOKE_PLATFORM"
  compose_files+=(--file "$ROOT_DIR/compose.smoke-platform.yml")
fi
compose=(
  docker compose
  --project-name "$PROJECT_NAME"
  --env-file "$ENV_FILE"
  "${compose_files[@]}"
)

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

available_port() {
  local candidate
  for _attempt in {1..50}; do
    candidate=$((20000 + RANDOM % 20000))
    if ! (echo >/dev/tcp/127.0.0.1/"$candidate") 2>/dev/null; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  echo "Could not find an available local port" >&2
  return 1
}

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && -f "$ENV_FILE" ]]; then
    "${compose[@]}" logs --no-color || true
  fi
  if [[ -f "$ENV_FILE" ]]; then
    "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$TEMP_DIR"
  exit "$status"
}

fetch() {
  local url="$1"
  local response
  for _attempt in {1..60}; do
    if response="$(curl -fsS --max-time 10 "$url")"; then
      printf '%s' "$response"
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for $url" >&2
  return 1
}

require_command curl
require_command docker
trap cleanup EXIT

HTTP_PORT="${SMOKE_HTTP_PORT:-$(available_port)}"
HTTPS_PORT="${SMOKE_HTTPS_PORT:-$(available_port)}"
SELF_HOST_ENV_FILE="$ENV_FILE" bash "$ROOT_DIR/scripts/init-self-host.sh"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
[[ -n "${POSTGRES_PASSWORD:-}" ]]
[[ -n "${MEDIA_URL_SIGNING_SECRET:-}" ]]

export DOMAIN=:80
export HTTP_PORT HTTPS_PORT
export APP_IMAGE="$IMAGE"
export TELEGRAM_BOT_TOKEN=123456:smoke-only-token
export TELEGRAM_BOT_USERNAME=smoke_gallery_bot
export TELEGRAM_ADMIN_APP_SHORT_NAME=admin_app
export TELEGRAM_GALLERY_APP_SHORT_NAME=gallery_app
export ADMIN_TG_IDS=1
export RUN_MIGRATIONS_ON_START=true

"${compose[@]}" config --quiet

if [[ "$BUILD_IMAGE" == "true" ]]; then
  docker build --tag "$IMAGE" "$ROOT_DIR"
elif [[ "$BUILD_IMAGE" != "false" ]]; then
  echo "SMOKE_BUILD must be true or false" >&2
  exit 1
fi

"${compose[@]}" up --detach --no-build --wait --wait-timeout 240

BASE_URL="http://127.0.0.1:$HTTP_PORT"
gallery_html="$(fetch "$BASE_URL/")"
admin_html="$(fetch "$BASE_URL/admin/")"
live_json="$(fetch "$BASE_URL/api/health/live")"
ready_json="$(fetch "$BASE_URL/api/health/ready")"

[[ "$gallery_html" == *'<title>Gallery</title>'* ]]
[[ "$admin_html" == *'<title>Gallery Admin</title>'* ]]
[[ "$live_json" == *'"status":"ok"'* ]]
[[ "$ready_json" == *'"status":"ready"'* ]]

if [[ "$admin_html" =~ src=\"(/admin/assets/[^\"]+)\" ]]; then
  fetch "$BASE_URL${BASH_REMATCH[1]}" >/dev/null
else
  echo "Admin index did not use /admin/ asset paths" >&2
  exit 1
fi

migration_count="$(
  "${compose[@]}" exec --no-TTY db \
    psql --username gallery --dbname gallery --tuples-only --no-align \
    --command 'SELECT count(*) FROM "_prisma_migrations";'
)"
if [[ ! "$migration_count" =~ ^[1-9][0-9]*$ ]]; then
  echo "Expected applied Prisma migrations, got: $migration_count" >&2
  exit 1
fi

echo "Self-host smoke passed: static apps, health, readiness, and migrations."
