#!/usr/bin/env bash
set -euo pipefail

HEALTH_URL=""
TIMEOUT_SECONDS=12

while [[ $# -gt 0 ]]; do
  case "$1" in
    --health-url)
      HEALTH_URL="${2:-}"
      shift 2
      ;;
    --timeout)
      TIMEOUT_SECONDS="${2:-12}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

pass() {
  echo "[PASS] $1"
}

fail() {
  echo "[FAIL] $1"
  return 1
}

check_non_empty_env() {
  local name="$1"
  local value="${!name:-}"
  if [[ -n "$value" ]]; then
    pass "env $name is set"
  else
    fail "env $name is missing"
  fi
}

echo "my-telegram-gallery Railway verification"
echo "-----------------------------------"

status=0

required_env=(
  DATABASE_URL
  TELEGRAM_BOT_TOKEN
  ADMIN_TG_ID
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET
  WEB_ORIGINS
)

for env_name in "${required_env[@]}"; do
  check_non_empty_env "$env_name" || status=1
done

if [[ -n "${HOST:-}" && "${HOST}" != "0.0.0.0" ]]; then
  echo "[WARN] HOST is '${HOST}'. Railway API services usually use HOST=0.0.0.0"
else
  pass "HOST is compatible with Railway (or unset)"
fi

if [[ -n "${PORT:-}" ]]; then
  if [[ "${PORT}" =~ ^[0-9]+$ ]]; then
    pass "PORT is numeric (${PORT})"
  else
    fail "PORT is not numeric (${PORT})" || status=1
  fi
else
  echo "[WARN] PORT is unset (Railway may still inject it at runtime)"
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  if [[ "${DATABASE_URL}" =~ ^postgres(ql)?:// ]]; then
    pass "DATABASE_URL looks like PostgreSQL"
  else
    fail "DATABASE_URL does not look like PostgreSQL URL" || status=1
  fi
fi

if [[ -n "$HEALTH_URL" ]]; then
  echo "Checking health endpoint: $HEALTH_URL"
  if curl -fsS --max-time "$TIMEOUT_SECONDS" "$HEALTH_URL" >/dev/null; then
    pass "health endpoint reachable"
  else
    fail "health endpoint check failed" || status=1
  fi
else
  echo "[WARN] Skipping health check (pass --health-url to enable)"
fi

if [[ "$status" -eq 0 ]]; then
  echo "-----------------------------------"
  echo "Verification complete: PASS"
  exit 0
fi

echo "-----------------------------------"
echo "Verification complete: FAIL"
exit 1
