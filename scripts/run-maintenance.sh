#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

kind="${1:-}"
limit="${MAINTENANCE_LIMIT:-500}"
if [[ "$kind" != "uploads" && "$kind" != "hourly" ]]; then
  echo "Usage: $0 uploads|hourly" >&2
  exit 64
fi
if ! [[ "$limit" =~ ^[0-9]+$ ]] || ((limit < 1 || limit > 10000)); then
  echo "MAINTENANCE_LIMIT must be an integer from 1 to 10000" >&2
  exit 64
fi

lock_dir="${GALLERY_MAINTENANCE_LOCK_DIR:-${TMPDIR:-/tmp}}"
mkdir -p "$lock_dir"
exec 9>"$lock_dir/my-telegram-gallery-maintenance.lock"
if command -v flock >/dev/null 2>&1; then
  if ! flock -n 9; then
    echo '{"status":"skipped","reason":"host_lock_held"}'
    exit 75
  fi
fi

exec docker compose exec -T app \
  node dist/src/maintenance-run "$kind" --limit "$limit"
