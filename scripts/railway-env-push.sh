#!/usr/bin/env bash
# Push .env.production files to Railway services.
# Usage: bash scripts/railway-env-push.sh [api|admin|gallery|all]
set -euo pipefail

push_env() {
  local service="$1"
  local file="$2"

  if [ ! -f "$file" ]; then
    echo "  skip: $file not found"
    return
  fi

  local args=()
  while IFS= read -r line || [ -n "$line" ]; do
    # skip comments and blank lines
    [[ -z "$line" || "$line" == \#* ]] && continue
    local key="${line%%=*}"
    local val="${line#*=}"
    # skip empty values
    [ -z "$val" ] && continue
    # strip surrounding quotes
    val="${val#\"}"
    val="${val%\"}"
    # convert literal \n to real newlines (for PEM keys etc.)
    val="${val//\\n/$'\n'}"
    args+=("${key}=${val}")
  done < "$file"

  if [ ${#args[@]} -eq 0 ]; then
    echo "  skip: no variables to set"
    return
  fi

  echo "  pushing ${#args[@]} variables to $service..."
  railway variable set "${args[@]}" --service "$service"
  echo "  done"
}

target="${1:-all}"

case "$target" in
  api)
    echo "API:"
    push_env api apps/api/.env.production
    ;;
  admin)
    echo "Admin:"
    push_env admin apps/admin/.env.production
    ;;
  gallery)
    echo "Gallery:"
    push_env gallery apps/gallery/.env.production
    ;;
  all)
    echo "API:"
    push_env api apps/api/.env.production
    echo "Admin:"
    push_env admin apps/admin/.env.production
    echo "Gallery:"
    push_env gallery apps/gallery/.env.production
    ;;
  *)
    echo "Usage: $0 [api|admin|gallery|all]"
    exit 1
    ;;
esac
