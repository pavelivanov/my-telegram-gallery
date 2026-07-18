#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/.env.selfhost.example"
TARGET_FILE="${SELF_HOST_ENV_FILE:-$ROOT_DIR/.env}"

if [[ -e "$TARGET_FILE" ]]; then
  echo ".env already exists; leaving it unchanged."
  exit 0
fi

ALLOW_DIRTY_SOURCE="${SELF_HOST_ALLOW_DIRTY_SOURCE:-false}"
if [[ "$ALLOW_DIRTY_SOURCE" != "true" && "$ALLOW_DIRTY_SOURCE" != "false" ]]; then
  echo "SELF_HOST_ALLOW_DIRTY_SOURCE must be true or false." >&2
  exit 1
fi
if git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  && [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  if [[ "$ALLOW_DIRTY_SOURCE" != "true" ]]; then
    echo "Commit the source before initialization so network users receive the exact deployed revision." >&2
    echo "For disposable development smoke only, set SELF_HOST_ALLOW_DIRTY_SOURCE=true." >&2
    exit 1
  fi
  echo "Warning: using HEAD source metadata for a dirty development checkout." >&2
fi

umask 077
cp "$SOURCE_FILE" "$TARGET_FILE"

random_hex() {
  dd if=/dev/urandom bs=32 count=1 2>/dev/null \
    | od -An -tx1 \
    | tr -d ' \n'
}

replace_value() {
  local key="$1"
  local value="$2"
  local temporary="$TARGET_FILE.tmp"
  awk -v key="$key" -v value="$value" '
    index($0, key "=") == 1 { print key "=" value; next }
    { print }
  ' "$TARGET_FILE" > "$temporary"
  mv "$temporary" "$TARGET_FILE"
}

replace_value POSTGRES_PASSWORD "$(random_hex)"
replace_value MEDIA_URL_SIGNING_SECRET "$(random_hex)"

if git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  revision="$(git -C "$ROOT_DIR" rev-parse HEAD)"
  source="$(git -C "$ROOT_DIR" config --get remote.origin.url || true)"
  case "$source" in
    git@github.com:*) source="https://github.com/${source#git@github.com:}" ;;
    ssh://git@github.com/*) source="https://github.com/${source#ssh://git@github.com/}" ;;
  esac
  source="${source%.git}"
  if [[ "$source" =~ ^https:// ]]; then
    short_revision="$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)"
    replace_value BUILD_SOURCE "$source"
    replace_value BUILD_SOURCE_URL "$source/tree/$revision"
    replace_value BUILD_REVISION "$revision"
    replace_value BUILD_VERSION "0.0.0-self-host.$short_revision"
  else
    echo "Warning: set BUILD_SOURCE_URL to an exact HTTPS source revision before sharing this deployment." >&2
  fi
else
  echo "Warning: set BUILD_SOURCE_URL to an exact, publicly reachable source revision before sharing this deployment." >&2
fi

echo "Created .env with generated database and media-signing secrets."
echo "Edit the required DOMAIN, Telegram, and administrator values before starting."
