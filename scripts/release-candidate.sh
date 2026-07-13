#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GITLEAKS_IMAGE="zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"
SYFT_IMAGE="anchore/syft:v1.46.0@sha256:473a60e3a58e29aca3aedb3e99e787bb4ef273917e44d10fcbea4330a07320bb"
GRYPE_IMAGE="anchore/grype:v0.115.0@sha256:decd87500a90c1e4faa1706f77b0b2cbc1d2f9364e976f1898ce9037de09cc3a"
IMAGE="${RELEASE_IMAGE:-my-telegram-gallery:release-candidate}"
VERSION="${RELEASE_VERSION:-0.0.0-dev}"
OUTPUT_DIR="${RELEASE_OUTPUT_DIR:-$ROOT_DIR/output/release}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

for command in docker git jq node pnpm shasum; do
  require_command "$command"
done

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Release candidates require a clean Git working tree." >&2
  exit 1
fi
if [[ "$OUTPUT_DIR" != "$ROOT_DIR/output/release" ]]; then
  echo "Release output is fixed at $ROOT_DIR/output/release." >&2
  exit 1
fi
if [[ ! "$VERSION" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$ ]]; then
  echo "RELEASE_VERSION contains unsupported characters." >&2
  exit 1
fi

REVISION="$(git rev-parse HEAD)"
CREATED="${SOURCE_DATE_CREATED:-$(git show -s --format=%cI HEAD)}"
SOURCE="${RELEASE_SOURCE_URL:-$(git config --get remote.origin.url || true)}"
case "$SOURCE" in
  git@github.com:*) SOURCE="https://github.com/${SOURCE#git@github.com:}" ;;
  ssh://git@github.com/*) SOURCE="https://github.com/${SOURCE#ssh://git@github.com/}" ;;
esac
SOURCE="${SOURCE%.git}"
if [[ ! "$SOURCE" =~ ^https:// ]]; then
  echo "Set RELEASE_SOURCE_URL to the reviewed HTTPS source repository URL." >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

pnpm install --frozen-lockfile
pnpm audit:dependencies
pnpm check
pnpm build

docker run --rm -v "$ROOT_DIR:/repo" -w /repo "$GITLEAKS_IMAGE" \
  git --redact --no-banner --no-color --log-opts=--all .

docker build --pull \
  --build-arg "BUILD_CREATED=$CREATED" \
  --build-arg "BUILD_REVISION=$REVISION" \
  --build-arg "BUILD_SOURCE=$SOURCE" \
  --build-arg "BUILD_VERSION=$VERSION" \
  --tag "$IMAGE" .

[[ "$(docker inspect --format '{{.Config.User}}' "$IMAGE")" == "node" ]]
[[ "$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$IMAGE")" == "$REVISION" ]]
[[ "$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$IMAGE")" == "$SOURCE" ]]
[[ "$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$IMAGE")" == "$VERSION" ]]
if docker run --rm --entrypoint sh "$IMAGE" -c \
  'find /app -type f \( -name .env -o -name ".env.*" \) -print -quit' | grep -q .; then
  echo "The runtime image contains an environment file." >&2
  exit 1
fi
if ! docker image inspect "$IMAGE" | jq -e '
  .[0].Config.Env
  | map(split("=")[0])
  | any(test("(^|_)(TOKEN|PASSWORD|SECRET|DATABASE_URL|ACCESS_KEY)(_|$)"))
  | not
' >/dev/null; then
  echo "The runtime image config contains a secret-shaped environment name." >&2
  exit 1
fi
docker run --rm --entrypoint node "$IMAGE" -e '
  require("sharp")({
    create: { width: 2, height: 2, channels: 3, background: "blue" },
  }).png().toBuffer().then((buffer) => {
    if (buffer.length === 0) process.exit(1);
  });
'

SMOKE_BUILD=false SMOKE_IMAGE="$IMAGE" bash scripts/smoke-self-host.sh

pnpm licenses list --prod --json > "$OUTPUT_DIR/licenses.json"
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$SYFT_IMAGE" \
  "docker:$IMAGE" --output cyclonedx-json > "$OUTPUT_DIR/sbom.cdx.json"

if ! docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$GRYPE_IMAGE" \
  "docker:$IMAGE" --output json --fail-on high > "$OUTPUT_DIR/vulnerabilities.json"; then
  jq -r '
    [.matches[].vulnerability.severity]
    | group_by(.)
    | map("\(.[0]): \(length)")
    | .[]
  ' "$OUTPUT_DIR/vulnerabilities.json" >&2
  echo "Image scan found a high or critical vulnerability." >&2
  exit 1
fi

docker save "$IMAGE" | gzip -n > "$OUTPUT_DIR/image.tar.gz"
docker run --rm -v "$OUTPUT_DIR:/scan" "$GITLEAKS_IMAGE" \
  dir --redact --no-banner --no-color --max-archive-depth=3 \
  --report-format=json --report-path=/scan/artifact-secrets.json \
  /scan/image.tar.gz
jq -n \
  --arg created "$CREATED" \
  --arg gitleaks "$GITLEAKS_IMAGE" \
  --arg grype "$GRYPE_IMAGE" \
  --arg image "$IMAGE" \
  --arg imageId "$(docker image inspect --format '{{.Id}}' "$IMAGE")" \
  --arg platform "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE")" \
  --arg revision "$REVISION" \
  --arg source "$SOURCE" \
  --arg syft "$SYFT_IMAGE" \
  --arg version "$VERSION" \
  '{created: $created, image: $image, imageId: $imageId, platform: $platform, revision: $revision, source: $source, tools: {gitleaks: $gitleaks, grype: $grype, syft: $syft}, version: $version}' \
  > "$OUTPUT_DIR/metadata.json"

(
  cd "$OUTPUT_DIR"
  shasum -a 256 artifact-secrets.json image.tar.gz licenses.json \
    metadata.json sbom.cdx.json vulnerabilities.json > SHA256SUMS
)

echo "Release candidate created in $OUTPUT_DIR for revision $REVISION."
