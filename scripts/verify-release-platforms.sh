#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GITLEAKS_IMAGE="zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f"
SYFT_IMAGE="anchore/syft:v1.46.0@sha256:473a60e3a58e29aca3aedb3e99e787bb4ef273917e44d10fcbea4330a07320bb"
GRYPE_IMAGE="anchore/grype:v0.115.0@sha256:decd87500a90c1e4faa1706f77b0b2cbc1d2f9364e976f1898ce9037de09cc3a"
PLATFORMS_CSV="${RELEASE_PLATFORMS:-linux/amd64,linux/arm64}"
REQUIRE_NATIVE="${RELEASE_REQUIRE_NATIVE:-false}"
VERSION="${RELEASE_VERSION:-0.0.0-platform-test}"
SUFFIX_ARCHITECTURE="${RELEASE_VERSION_SUFFIX_ARCHITECTURE:-true}"
OUTPUT_DIR="$ROOT_DIR/output/platforms"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

for command in docker git gzip jq shasum; do
  require_command "$command"
done

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Platform verification requires a clean Git working tree." >&2
  exit 1
fi
if [[ ! "$VERSION" =~ ^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$ ]]; then
  echo "RELEASE_VERSION contains unsupported characters." >&2
  exit 1
fi
if [[ "$REQUIRE_NATIVE" != "true" && "$REQUIRE_NATIVE" != "false" ]]; then
  echo "RELEASE_REQUIRE_NATIVE must be true or false." >&2
  exit 1
fi
if [[ "$SUFFIX_ARCHITECTURE" != "true" && "$SUFFIX_ARCHITECTURE" != "false" ]]; then
  echo "RELEASE_VERSION_SUFFIX_ARCHITECTURE must be true or false." >&2
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
SOURCE_URL="$SOURCE/tree/$REVISION"

HOST_ARCHITECTURE="$(docker info --format '{{.Architecture}}')"
case "$HOST_ARCHITECTURE" in
  aarch64) HOST_ARCHITECTURE=arm64 ;;
  x86_64) HOST_ARCHITECTURE=amd64 ;;
esac
IFS=',' read -r -a platforms <<< "$PLATFORMS_CSV"
if [[ "${#platforms[@]}" -eq 0 ]]; then
  echo "RELEASE_PLATFORMS must list at least one platform." >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

for platform in "${platforms[@]}"; do
  case "$platform" in
    linux/amd64 | linux/arm64) ;;
    *)
      echo "Unsupported release-test platform: $platform" >&2
      exit 1
      ;;
  esac

  architecture="${platform#linux/}"
  if [[ "$REQUIRE_NATIVE" == "true" && "$architecture" != "$HOST_ARCHITECTURE" ]]; then
    echo "Native verification requires host architecture $architecture; Docker reports $HOST_ARCHITECTURE." >&2
    exit 1
  fi
  image="my-telegram-gallery:platform-$architecture"
  image_version="$VERSION"
  if [[ "$SUFFIX_ARCHITECTURE" == "true" ]]; then
    image_version="$VERSION-$architecture"
  fi
  platform_output="$OUTPUT_DIR/$architecture"
  mkdir -p "$platform_output"
  platform_started="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  docker buildx build --pull --platform "$platform" --load \
    --build-arg "BUILD_CREATED=$CREATED" \
    --build-arg "BUILD_REVISION=$REVISION" \
    --build-arg "BUILD_SOURCE=$SOURCE" \
    --build-arg "BUILD_SOURCE_URL=$SOURCE_URL" \
    --build-arg "BUILD_VERSION=$image_version" \
    --tag "$image" .

  [[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")" == "$platform" ]]
  [[ "$(docker image inspect --format '{{.Config.User}}' "$image")" == "node" ]]
  [[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image")" == "$REVISION" ]]
  [[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$image")" == "$SOURCE" ]]
  [[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$image")" == "$image_version" ]]
  [[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.licenses" }}' "$image")" == "AGPL-3.0-only" ]]
  [[ "$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image" | awk -F= '$1 == "APP_SOURCE_URL" { print substr($0, index($0, "=") + 1) }')" == "$SOURCE_URL" ]]
  [[ "$(docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$image" | awk -F= '$1 == "APP_VERSION" { print substr($0, index($0, "=") + 1) }')" == "$image_version" ]]

  docker run --rm --platform "$platform" --entrypoint node "$image" -e '
    require("sharp")({
      create: { width: 2, height: 2, channels: 3, background: "blue" },
    }).png().toBuffer().then((buffer) => {
      if (buffer.length === 0) process.exit(1);
    });
  '

  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$SYFT_IMAGE" \
    "docker:$image" --output cyclonedx-json > "$platform_output/sbom.cdx.json"
  if ! docker run --rm -v /var/run/docker.sock:/var/run/docker.sock "$GRYPE_IMAGE" \
    "docker:$image" --output json --fail-on high \
    > "$platform_output/vulnerabilities.json"; then
    jq -r '
      [.matches[].vulnerability.severity]
      | group_by(.)
      | map("\(.[0]): \(length)")
      | .[]
    ' "$platform_output/vulnerabilities.json" >&2
    echo "$platform image scan found a high or critical vulnerability." >&2
    exit 1
  fi

  image_id="$(docker image inspect --format '{{.Id}}' "$image")"
  docker save "$image" | gzip -n > "$platform_output/image.tar.gz"
  docker run --rm -v "$platform_output:/scan" "$GITLEAKS_IMAGE" \
    dir --redact --no-banner --no-color --max-archive-depth=3 \
    --report-format=json --report-path=/scan/artifact-secrets.json \
    /scan/image.tar.gz

  if [[ "$architecture" == "$HOST_ARCHITECTURE" ]]; then
    emulated=false
  else
    emulated=true
  fi
  jq -n \
    --arg architecture "$architecture" \
    --arg created "$CREATED" \
    --argjson emulated "$emulated" \
    --arg gitleaks "$GITLEAKS_IMAGE" \
    --arg grype "$GRYPE_IMAGE" \
    --arg hostArchitecture "$HOST_ARCHITECTURE" \
    --arg image "$image" \
    --arg imageId "$image_id" \
    --arg platform "$platform" \
    --arg revision "$REVISION" \
    --arg source "$SOURCE" \
    --arg syft "$SYFT_IMAGE" \
    --arg version "$image_version" \
    '{architecture: $architecture, created: $created, emulated: $emulated, hostArchitecture: $hostArchitecture, image: $image, imageId: $imageId, platform: $platform, revision: $revision, source: $source, tools: {gitleaks: $gitleaks, grype: $grype, syft: $syft}, version: $version}' \
    > "$platform_output/metadata.json"
  platform_finished="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  bash scripts/write-local-provenance.sh \
    "$platform_output/provenance.intoto.json" \
    "$platform_output/image.tar.gz" \
    "$platform_output/metadata.json" \
    scripts/verify-release-platforms.sh \
    "$platform_started" \
    "$platform_finished"
  bash scripts/verify-local-provenance.sh \
    "$platform_output/provenance.intoto.json" \
    "$platform_output/image.tar.gz" \
    "$platform_output/metadata.json" \
    scripts/verify-release-platforms.sh

  (
    cd "$platform_output"
    shasum -a 256 artifact-secrets.json image.tar.gz metadata.json \
      provenance.intoto.json sbom.cdx.json vulnerabilities.json > SHA256SUMS
  )

  docker image rm "$image" >/dev/null
  gzip -dc "$platform_output/image.tar.gz" | docker load >/dev/null
  [[ "$(docker image inspect --format '{{.Id}}' "$image")" == "$image_id" ]]

  LIFECYCLE_BUILD=false LIFECYCLE_IMAGE="$image_id" \
    LIFECYCLE_PLATFORM="$platform" bash scripts/smoke-backup-restore.sh
  (cd "$platform_output" && shasum -a 256 -c SHA256SUMS)
done

echo "Release platforms verified from saved archives: $PLATFORMS_CSV"
