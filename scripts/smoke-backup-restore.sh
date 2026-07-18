#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_PROJECT="my-telegram-gallery-lifecycle-source-${RANDOM}-$$"
RESTORE_PROJECT="my-telegram-gallery-lifecycle-restore-${RANDOM}-$$"
TEMP_DIR="$(mktemp -d)"
SOURCE_ENV="$TEMP_DIR/source.env"
RESTORE_ENV="$TEMP_DIR/restore.env"
BACKUP_DIR="$TEMP_DIR/backup"
IMAGE="${LIFECYCLE_IMAGE:-my-telegram-gallery:lifecycle}"
BUILD_IMAGE="${LIFECYCLE_BUILD:-true}"
PLATFORM="${LIFECYCLE_PLATFORM:-}"
MEDIA_DIRECTORY="tenants/tenant_default/photos/lifecycle_album/lifecycle_photo"
compose_files=(--file "$ROOT_DIR/docker-compose.yml")

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

assert_equal() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" != "$expected" ]]; then
    printf 'Lifecycle assertion failed for %s.\nExpected:\n%s\nActual:\n%s\n' \
      "$label" "$expected" "$actual" >&2
    exit 1
  fi
}

assert_contains() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [[ "$actual" != *"$expected"* ]]; then
    printf 'Lifecycle assertion failed for %s: missing %s.\n' \
      "$label" "$expected" >&2
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

compose_cmd() {
  local project="$1"
  local env_file="$2"
  shift 2
  docker compose \
    --project-name "$project" \
    --env-file "$env_file" \
    "${compose_files[@]}" \
    "$@"
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

database_state() {
  local project="$1"
  local env_file="$2"
  compose_cmd "$project" "$env_file" exec --no-TTY db \
    psql --username gallery --dbname gallery --tuples-only --no-align \
    --field-separator='|' --command '
      SELECT
        (SELECT COUNT(*) FROM "Album" WHERE "tenantId" = tenant."id"),
        (SELECT COUNT(*) FROM "Photo" WHERE "tenantId" = tenant."id"),
        tenant."albumCount",
        tenant."photoCount",
        tenant."storageUsedBytes",
        tenant."storageReservedBytes"
      FROM "Tenant" tenant
      WHERE tenant."id" = '\''tenant_default'\'';
    ' | tr -d '[:space:]'
}

media_manifest() {
  local project="$1"
  local env_file="$2"
  compose_cmd "$project" "$env_file" exec --no-TTY app sh -c "
    cd /data/media
    sha256sum \\
      '$MEDIA_DIRECTORY/original' \\
      '$MEDIA_DIRECTORY/original.metadata.json' \\
      '$MEDIA_DIRECTORY/preview.webp' \\
      '$MEDIA_DIRECTORY/preview.webp.metadata.json' \\
      '$MEDIA_DIRECTORY/thumb.webp' \\
      '$MEDIA_DIRECTORY/thumb.webp.metadata.json'
  " | tr -d '\r'
}

migration_count() {
  local project="$1"
  local env_file="$2"
  compose_cmd "$project" "$env_file" exec --no-TTY db \
    psql --username gallery --dbname gallery --tuples-only --no-align \
    --command 'SELECT COUNT(*) FROM "_prisma_migrations";' \
    | tr -d '[:space:]'
}

verify_http() {
  local base_url="http://127.0.0.1:$HTTP_PORT"
  local gallery_html admin_html live_json ready_json
  gallery_html="$(fetch "$base_url/")"
  admin_html="$(fetch "$base_url/admin/")"
  live_json="$(fetch "$base_url/api/health/live")"
  ready_json="$(fetch "$base_url/api/health/ready")"
  assert_contains "gallery HTML" '<title>Gallery</title>' "$gallery_html"
  assert_contains "admin HTML" '<title>Gallery Admin</title>' "$admin_html"
  assert_contains "liveness response" '"status":"ok"' "$live_json"
  assert_contains "readiness response" '"status":"ready"' "$ready_json"
  if [[ "$gallery_html" =~ src=\"(/assets/[^\"]+)\" ]]; then
    fetch "$base_url${BASH_REMATCH[1]}" >/dev/null
  else
    echo "Gallery index did not use /assets/ paths" >&2
    return 1
  fi
  if [[ "$admin_html" =~ src=\"(/admin/assets/[^\"]+)\" ]]; then
    fetch "$base_url${BASH_REMATCH[1]}" >/dev/null
  else
    echo "Admin index did not use /admin/ asset paths" >&2
    return 1
  fi
}

cleanup() {
  local exit_status=$?
  trap - EXIT
  if [[ "$exit_status" -ne 0 ]]; then
    if [[ -f "$SOURCE_ENV" ]]; then
      compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" logs --no-color || true
    fi
    if [[ -f "$RESTORE_ENV" ]]; then
      compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" logs --no-color || true
    fi
  fi
  if [[ -f "$SOURCE_ENV" ]]; then
    compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" down -v --remove-orphans \
      >/dev/null 2>&1 || true
  fi
  if [[ -f "$RESTORE_ENV" ]]; then
    compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" down -v --remove-orphans \
      >/dev/null 2>&1 || true
  fi
  rm -rf "$TEMP_DIR"
  exit "$exit_status"
}

for command in curl docker git jq shasum tar; do
  require_command "$command"
done
if [[ ! "$IMAGE" =~ ^[0-9A-Za-z][0-9A-Za-z._/:@-]{0,255}$ ]]; then
  echo "LIFECYCLE_IMAGE is not a safe Docker image reference." >&2
  exit 1
fi
if [[ "$BUILD_IMAGE" != "true" && "$BUILD_IMAGE" != "false" ]]; then
  echo "LIFECYCLE_BUILD must be true or false." >&2
  exit 1
fi
if [[ -n "$PLATFORM" ]]; then
  if [[ ! "$PLATFORM" =~ ^linux/(amd64|arm64)$ ]]; then
    echo "LIFECYCLE_PLATFORM must be linux/amd64 or linux/arm64." >&2
    exit 1
  fi
  export APP_PLATFORM="$PLATFORM"
  compose_files+=(--file "$ROOT_DIR/compose.smoke-platform.yml")
fi
trap cleanup EXIT

if [[ "$BUILD_IMAGE" == "true" ]]; then
  build_args=(--tag "$IMAGE")
  if [[ -n "$PLATFORM" ]]; then
    build_args+=(--platform "$PLATFORM")
  fi
  docker build "${build_args[@]}" "$ROOT_DIR"
else
  docker image inspect "$IMAGE" >/dev/null
fi

SELF_HOST_ALLOW_DIRTY_SOURCE=true SELF_HOST_ENV_FILE="$SOURCE_ENV" \
  bash "$ROOT_DIR/scripts/init-self-host.sh"
set -a
# shellcheck disable=SC1090
source "$SOURCE_ENV"
set +a

export DOMAIN=:80
export HTTP_PORT="${LIFECYCLE_HTTP_PORT:-$(available_port)}"
export HTTPS_PORT="${LIFECYCLE_HTTPS_PORT:-$(available_port)}"
export APP_IMAGE="$IMAGE"
export TELEGRAM_BOT_TOKEN=123456:lifecycle-only-token
export TELEGRAM_BOT_USERNAME=lifecycle_gallery_bot
export TELEGRAM_ADMIN_APP_SHORT_NAME=admin_app
export TELEGRAM_GALLERY_APP_SHORT_NAME=gallery_app
export ADMIN_TG_IDS=1
export RUN_MIGRATIONS_ON_START=true

compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" config --quiet
compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" up \
  --detach --no-build --wait --wait-timeout 240
verify_http
source_migration_count="$(migration_count "$SOURCE_PROJECT" "$SOURCE_ENV")"
if [[ ! "$source_migration_count" =~ ^[1-9][0-9]*$ ]]; then
  echo "Expected applied Prisma migrations, got: $source_migration_count" >&2
  exit 1
fi

compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" exec --no-TTY app sh -c "
  set -eu
  mkdir -p '/data/media/$MEDIA_DIRECTORY'
  printf %s 'lifecycle-original' > '/data/media/$MEDIA_DIRECTORY/original'
  printf %s '{\"contentType\":\"image/png\"}' > '/data/media/$MEDIA_DIRECTORY/original.metadata.json'
  printf %s 'lifecycle-preview' > '/data/media/$MEDIA_DIRECTORY/preview.webp'
  printf %s '{\"contentType\":\"image/webp\"}' > '/data/media/$MEDIA_DIRECTORY/preview.webp.metadata.json'
  printf %s 'lifecycle-thumb' > '/data/media/$MEDIA_DIRECTORY/thumb.webp'
  printf %s '{\"contentType\":\"image/webp\"}' > '/data/media/$MEDIA_DIRECTORY/thumb.webp.metadata.json'
"
stored_bytes="$(
  compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" exec --no-TTY app sh -c "
    original=\$(wc -c < '/data/media/$MEDIA_DIRECTORY/original')
    preview=\$(wc -c < '/data/media/$MEDIA_DIRECTORY/preview.webp')
    thumb=\$(wc -c < '/data/media/$MEDIA_DIRECTORY/thumb.webp')
    printf %s \$((original + preview + thumb))
  " | tr -d '[:space:]'
)"
if [[ ! "$stored_bytes" =~ ^[1-9][0-9]*$ ]]; then
  echo "Could not calculate lifecycle media bytes." >&2
  exit 1
fi

compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" exec --no-TTY db \
  psql --username gallery --dbname gallery --set ON_ERROR_STOP=1 <<SQL
BEGIN;
INSERT INTO "Album" ("id", "tenantId", "name", "createdAt")
VALUES ('lifecycle_album', 'tenant_default', 'Lifecycle album', CURRENT_TIMESTAMP);
INSERT INTO "Photo" (
  "id", "key", "thumbKey", "previewKey", "mimeType", "size",
  "storedBytes", "width", "height", "position", "tenantId", "albumId",
  "createdAt"
) VALUES (
  'lifecycle_photo',
  '$MEDIA_DIRECTORY/original',
  '$MEDIA_DIRECTORY/thumb.webp',
  '$MEDIA_DIRECTORY/preview.webp',
  'image/png',
  $stored_bytes,
  $stored_bytes,
  1,
  1,
  0,
  'tenant_default',
  'lifecycle_album',
  CURRENT_TIMESTAMP
);
UPDATE "Tenant"
SET
  "albumCount" = 1,
  "photoCount" = 1,
  "storageUsedBytes" = $stored_bytes,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'tenant_default';
COMMIT;
SQL

expected_database_state="1|1|1|1|$stored_bytes|0"
asserted_database_state="$(database_state "$SOURCE_PROJECT" "$SOURCE_ENV")"
assert_equal "seeded database state" \
  "$expected_database_state" "$asserted_database_state"
source_media_manifest="$(media_manifest "$SOURCE_PROJECT" "$SOURCE_ENV")"

compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" restart app
compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" up \
  --detach --no-build --wait --wait-timeout 240 app caddy
verify_http
assert_equal "source database state after restart" "$expected_database_state" \
  "$(database_state "$SOURCE_PROJECT" "$SOURCE_ENV")"
assert_equal "source media after restart" "$source_media_manifest" \
  "$(media_manifest "$SOURCE_PROJECT" "$SOURCE_ENV")"

mkdir -p "$BACKUP_DIR"
compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" exec --no-TTY db \
  pg_dump --username gallery --dbname gallery --format=custom \
  > "$BACKUP_DIR/gallery.dump"
compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" exec --no-TTY app \
  tar -C /data/media -cf - . > "$BACKUP_DIR/media.tar"
cp "$SOURCE_ENV" "$BACKUP_DIR/env"
chmod 600 "$BACKUP_DIR/env"
{
  printf 'source_revision=%s\n' "$(git rev-parse HEAD)"
  printf 'image_id=%s\n' "$(docker image inspect --format '{{.Id}}' "$IMAGE")"
  printf 'platform=%s\n' "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE")"
} > "$BACKUP_DIR/metadata"
(
  cd "$BACKUP_DIR"
  shasum -a 256 env gallery.dump media.tar metadata > SHA256SUMS
  shasum -a 256 -c SHA256SUMS
)

compose_cmd "$SOURCE_PROJECT" "$SOURCE_ENV" down -v --remove-orphans
cp "$BACKUP_DIR/env" "$RESTORE_ENV"
chmod 600 "$RESTORE_ENV"
compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" config --quiet
compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" up \
  --detach --no-build --wait --wait-timeout 120 db
compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" exec --no-TTY db \
  pg_restore \
    --username gallery \
    --dbname gallery \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --exit-on-error \
  < "$BACKUP_DIR/gallery.dump"
compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" run \
  --rm --no-deps --entrypoint sh app \
  -c 'tar -C /data/media -xf -' < "$BACKUP_DIR/media.tar"
compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" up \
  --detach --no-build --wait --wait-timeout 240
verify_http

assert_equal "restored migration history" "$source_migration_count" \
  "$(migration_count "$RESTORE_PROJECT" "$RESTORE_ENV")"
assert_equal "restored database state" "$expected_database_state" \
  "$(database_state "$RESTORE_PROJECT" "$RESTORE_ENV")"
assert_equal "restored media" "$source_media_manifest" \
  "$(media_manifest "$RESTORE_PROJECT" "$RESTORE_ENV")"
compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" exec --no-TTY app sh -c "
  set -eu
  test -w '/data/media/$MEDIA_DIRECTORY'
  printf %s restore-write-probe > '/data/media/$MEDIA_DIRECTORY/restore-write-probe'
  rm '/data/media/$MEDIA_DIRECTORY/restore-write-probe'
"

usage_json="$(
  compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" exec --no-TTY app \
    node dist/src/usage-reconcile --dry-run --tenant default --limit 100
)"
printf '%s' "$usage_json" | jq -e '
  .mode == "dry-run" and
  .processedTenants == 1 and
  .driftedTenants == 0 and
  all(.results[]; .drift == false and .incomplete == false and (.issues | length == 0))
' >/dev/null
billing_json="$(
  compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" exec --no-TTY app \
    node dist/src/billing-reconcile --tenant default --limit 100
)"
printf '%s' "$billing_json" | jq -e '
  .processed == 0 and .discrepancies == 0
' >/dev/null

compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" restart app
compose_cmd "$RESTORE_PROJECT" "$RESTORE_ENV" up \
  --detach --no-build --wait --wait-timeout 240 app caddy
verify_http
assert_equal "restored database state after restart" "$expected_database_state" \
  "$(database_state "$RESTORE_PROJECT" "$RESTORE_ENV")"
assert_equal "restored media after restart" "$source_media_manifest" \
  "$(media_manifest "$RESTORE_PROJECT" "$RESTORE_ENV")"

echo "Backup/restore lifecycle smoke passed: restart persistence, checksums, database/media restore, writeability, and reconciliation."
