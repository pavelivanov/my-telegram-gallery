#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Deploy selected Railway services and wait for terminal deployment status.

Usage:
  bash scripts/railway-deploy.sh [services...] [options]

Arguments:
  services                   Service names to deploy: api, admin, gallery
                             (default: all three). Equivalent to --services.

Options:
  --services <csv>           Comma-separated service names (default: api,admin,gallery)
                             Each service uploads apps/<service> as the source root.
  --message <text>           Deployment message shown in Railway
  --timeout <seconds>        Max seconds to wait per service deployment (default: 900)
  --poll-interval <seconds>  Seconds between status polls (default: 5)
  --health-url <url>         API health URL to check after API deploy
  --health-timeout <seconds> Max seconds to wait for API health check (default: 120)
  --push-env <target>        Push env files first via railway-env-push.sh: api|admin|gallery|all|none (default: none)
  --project <id>             Railway project ID (requires --environment)
  --environment <name-or-id> Railway environment name/ID
  --skip-health-check        Skip post-deploy API health check
  -h, --help                 Show this help

Examples:
  bash scripts/railway-deploy.sh
  bash scripts/railway-deploy.sh gallery
  bash scripts/railway-deploy.sh api admin
  bash scripts/railway-deploy.sh --services api --health-url "https://api-production-826a8.up.railway.app/api/health"
  bash scripts/railway-deploy.sh --project <project-id> --environment production --services api
EOF
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

is_positive_integer() {
  [[ "$1" =~ ^[0-9]+$ ]] && [[ "$1" -gt 0 ]]
}

is_failure_status() {
  case "$1" in
    FAILED | CRASHED | REMOVED | CANCELED | CANCELLED | ABORTED)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

parse_latest_deployment() {
  node -e '
    const fs = require("fs");
    const list = JSON.parse(fs.readFileSync(0, "utf8"));
    const dep = Array.isArray(list) ? list[0] : null;
    const safe = (v) => String(v ?? "").replace(/\t/g, " ");
    process.stdout.write(`${safe(dep?.id)}\t${safe(dep?.status)}\t${safe(dep?.createdAt)}`);
  '
}

fetch_latest_deployment_info() {
  local service="$1"
  local output
  output="$(railway_with_scope deployment list --service "$service" --limit 1 --json)"
  printf '%s' "$output" | parse_latest_deployment
}

print_failure_logs() {
  local service="$1"
  local deployment_id="$2"
  local lines=120

  echo "[$service] Last ${lines} build log lines for deployment $deployment_id:"
  railway_with_scope logs "$deployment_id" \
    --service "$service" \
    --build \
    --lines "$lines" || true

  echo "[$service] Last ${lines} deploy/runtime log lines for deployment $deployment_id:"
  railway_with_scope logs "$deployment_id" \
    --service "$service" \
    --deployment \
    --lines "$lines" || true
}

wait_for_deployment() {
  local service="$1"
  local previous_id="$2"
  local deadline=$((SECONDS + DEPLOY_TIMEOUT_SECONDS))
  local tracked_id=""
  local last_status=""

  while ((SECONDS < deadline)); do
    local info latest_id latest_status latest_created_at
    info="$(fetch_latest_deployment_info "$service")"
    IFS=$'\t' read -r latest_id latest_status latest_created_at <<<"$info"

    if [[ -z "$latest_id" ]]; then
      echo "[$service] Waiting for first deployment to appear..."
      sleep "$POLL_INTERVAL_SECONDS"
      continue
    fi

    if [[ -z "$tracked_id" ]]; then
      if [[ -n "$previous_id" && "$latest_id" == "$previous_id" ]]; then
        echo "[$service] Waiting for a new deployment to be created..."
        sleep "$POLL_INTERVAL_SECONDS"
        continue
      fi
      tracked_id="$latest_id"
      echo "[$service] Tracking deployment $tracked_id (created $latest_created_at)"
    elif [[ "$latest_id" != "$tracked_id" ]]; then
      echo "[$service] Detected newer deployment $latest_id. Tracking newest deployment."
      tracked_id="$latest_id"
    fi

    if [[ "$latest_status" != "$last_status" ]]; then
      echo "[$service] Status: $latest_status"
      last_status="$latest_status"
    fi

    if [[ "$latest_status" == "SUCCESS" ]]; then
      LAST_DEPLOYMENT_ID="$tracked_id"
      return 0
    fi

    if is_failure_status "$latest_status"; then
      echo "[$service] Deployment failed with status: $latest_status"
      print_failure_logs "$service" "$tracked_id"
      return 1
    fi

    sleep "$POLL_INTERVAL_SECONDS"
  done

  if [[ -n "$tracked_id" ]]; then
    echo "[$service] Timed out after ${DEPLOY_TIMEOUT_SECONDS}s waiting for deployment $tracked_id"
    print_failure_logs "$service" "$tracked_id"
  else
    echo "[$service] Timed out after ${DEPLOY_TIMEOUT_SECONDS}s waiting for deployment to start"
  fi
  return 1
}

resolve_api_health_url() {
  local output domain
  output="$(railway_with_scope status --json)"
  domain="$(
    printf '%s' "$output" | node -e '
      const fs = require("fs");
      const data = JSON.parse(fs.readFileSync(0, "utf8"));
      const envEdges = data?.environments?.edges ?? [];
      const envNode = envEdges.find((edge) => edge?.node?.name === "production")?.node ?? envEdges[0]?.node;
      if (!envNode) process.exit(0);

      const instances = (envNode?.serviceInstances?.edges ?? []).map((edge) => edge?.node).filter(Boolean);
      const api = instances.find((instance) => instance?.serviceName === "api");
      if (!api) process.exit(0);

      const custom = (api?.domains?.customDomains ?? []).find((entry) => entry?.domain)?.domain;
      const service = (api?.domains?.serviceDomains ?? []).find((entry) => entry?.domain)?.domain;
      process.stdout.write(custom || service || "");
    '
  )"

  if [[ -z "$domain" ]]; then
    return 1
  fi

  if [[ "$domain" =~ ^https?:// ]]; then
    printf '%s/api/health\n' "${domain%/}"
  else
    printf 'https://%s/api/health\n' "$domain"
  fi
}

wait_for_health() {
  local url="$1"
  local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))

  echo "[api] Waiting for health endpoint: $url"

  while ((SECONDS < deadline)); do
    if curl -fsS --max-time 10 "$url" >/dev/null; then
      echo "[api] Health check passed"
      return 0
    fi
    sleep 2
  done

  echo "[api] Health check failed after ${HEALTH_TIMEOUT_SECONDS}s: $url" >&2
  return 1
}

railway_with_scope() {
  if [[ -n "$PROJECT" || -n "$ENVIRONMENT" ]]; then
    railway "$@" "${RAILWAY_SCOPE_ARGS[@]}"
  else
    railway "$@"
  fi
}

SERVICES_CSV="api,admin,gallery"
MESSAGE=""
DEPLOY_TIMEOUT_SECONDS=900
POLL_INTERVAL_SECONDS=5
HEALTH_TIMEOUT_SECONDS=120
API_HEALTH_URL=""
PUSH_ENV_TARGET="none"
PROJECT=""
ENVIRONMENT=""
SKIP_HEALTH_CHECK=0
LAST_DEPLOYMENT_ID=""
POSITIONAL_SERVICES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --services)
      SERVICES_CSV="${2:-}"
      shift 2
      ;;
    --message)
      MESSAGE="${2:-}"
      shift 2
      ;;
    --timeout)
      DEPLOY_TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --poll-interval)
      POLL_INTERVAL_SECONDS="${2:-}"
      shift 2
      ;;
    --health-url)
      API_HEALTH_URL="${2:-}"
      shift 2
      ;;
    --health-timeout)
      HEALTH_TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --push-env)
      PUSH_ENV_TARGET="${2:-}"
      shift 2
      ;;
    --project)
      PROJECT="${2:-}"
      shift 2
      ;;
    --environment)
      ENVIRONMENT="${2:-}"
      shift 2
      ;;
    --skip-health-check)
      SKIP_HEALTH_CHECK=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [[ -d "apps/$1" ]]; then
        POSITIONAL_SERVICES+=("$1")
      else
        echo "Unknown service: $1 (no apps/$1 directory)" >&2
        usage
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ "${#POSITIONAL_SERVICES[@]}" -gt 0 ]]; then
  SERVICES_CSV="$(IFS=','; echo "${POSITIONAL_SERVICES[*]}")"
fi

if [[ -z "$SERVICES_CSV" ]]; then
  echo "--services cannot be empty" >&2
  exit 1
fi

if ! is_positive_integer "$DEPLOY_TIMEOUT_SECONDS"; then
  echo "--timeout must be a positive integer" >&2
  exit 1
fi

if ! is_positive_integer "$POLL_INTERVAL_SECONDS"; then
  echo "--poll-interval must be a positive integer" >&2
  exit 1
fi

if ! is_positive_integer "$HEALTH_TIMEOUT_SECONDS"; then
  echo "--health-timeout must be a positive integer" >&2
  exit 1
fi

case "$PUSH_ENV_TARGET" in
  api | admin | gallery | all | none) ;;
  *)
    echo "--push-env must be one of: api, admin, gallery, all, none" >&2
    exit 1
    ;;
esac

if [[ -n "$PROJECT" && -z "$ENVIRONMENT" ]]; then
  echo "--project requires --environment for Railway CLI context resolution" >&2
  exit 1
fi

require_command railway
require_command node
require_command curl

if [[ -z "$MESSAGE" ]]; then
  MESSAGE="Automated deploy $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
fi

RAILWAY_SCOPE_ARGS=()
if [[ -n "$PROJECT" ]]; then
  RAILWAY_SCOPE_ARGS+=(--project "$PROJECT")
fi
if [[ -n "$ENVIRONMENT" ]]; then
  RAILWAY_SCOPE_ARGS+=(--environment "$ENVIRONMENT")
fi

SERVICES=()
IFS=',' read -r -a raw_services <<<"$SERVICES_CSV"
for raw_service in "${raw_services[@]}"; do
  service_name="${raw_service//[[:space:]]/}"
  if [[ -n "$service_name" ]]; then
    SERVICES+=("$service_name")
  fi
done

if [[ "${#SERVICES[@]}" -eq 0 ]]; then
  echo "No valid services resolved from --services '${SERVICES_CSV}'" >&2
  exit 1
fi

echo "Railway deploy helper"
echo "---------------------"
echo "Services       : ${SERVICES[*]}"
echo "Timeout/service: ${DEPLOY_TIMEOUT_SECONDS}s"
echo "Poll interval  : ${POLL_INTERVAL_SECONDS}s"
echo "Message        : ${MESSAGE}"

echo "Checking Railway auth/context..."
railway whoami --json >/dev/null
if [[ -z "$PROJECT" && -z "$ENVIRONMENT" ]]; then
  railway status --json >/dev/null
fi

if [[ "$PUSH_ENV_TARGET" != "none" ]]; then
  echo "Pushing environment variables (${PUSH_ENV_TARGET})..."
  bash scripts/railway-env-push.sh "$PUSH_ENV_TARGET"
fi

deployed_api=0

for service in "${SERVICES[@]}"; do
  echo
  service_path="apps/${service}"
  if [[ ! -d "$service_path" ]]; then
    echo "[$service] No ${service_path} directory — unknown service" >&2
    exit 1
  fi

  echo "[$service] Resolving latest deployment before upload..."
  baseline_info="$(fetch_latest_deployment_info "$service")"
  IFS=$'\t' read -r baseline_id _baseline_status _baseline_created <<<"$baseline_info"

  echo "[$service] Triggering deploy (uploading ${service_path})..."
  railway_with_scope up "$service_path" --path-as-root --service "$service" --detach -m "$MESSAGE"

  if ! wait_for_deployment "$service" "$baseline_id"; then
    exit 1
  fi

  echo "[$service] Deploy succeeded (deployment: $LAST_DEPLOYMENT_ID)"

  if [[ "$service" == "api" ]]; then
    deployed_api=1
  fi
done

if [[ "$deployed_api" -eq 1 && "$SKIP_HEALTH_CHECK" -eq 0 ]]; then
  if [[ -z "$API_HEALTH_URL" ]]; then
    if [[ -n "$PROJECT" || -n "$ENVIRONMENT" ]]; then
      echo "[WARN] Skipping API health check: pass --health-url when using --project/--environment overrides."
    else
      API_HEALTH_URL="$(resolve_api_health_url || true)"
    fi
  fi

  if [[ -n "$API_HEALTH_URL" ]]; then
    wait_for_health "$API_HEALTH_URL"
  else
    echo "[WARN] Skipping API health check: no URL detected. Pass --health-url to enable."
  fi
fi

echo
echo "All requested deployments finished successfully."
