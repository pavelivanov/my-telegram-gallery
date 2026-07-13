#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/.env.selfhost.example"
TARGET_FILE="${SELF_HOST_ENV_FILE:-$ROOT_DIR/.env}"

if [[ -e "$TARGET_FILE" ]]; then
  echo ".env already exists; leaving it unchanged."
  exit 0
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

echo "Created .env with generated database and media-signing secrets."
echo "Edit the required DOMAIN, Telegram, and administrator values before starting."
