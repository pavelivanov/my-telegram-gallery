#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--" ]]; then
  shift
fi
if [[ "$#" -gt 1 ]]; then
  echo "Usage: $0 [EVIDENCE_DIRECTORY]" >&2
  exit 1
fi
EVIDENCE_INPUT="${1:-output/release}"

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
    echo "Release evidence mismatch for $label: expected $expected, got $actual" >&2
    exit 1
  fi
}

for command in docker git gzip jq shasum; do
  require_command "$command"
done

if [[ ! -d "$EVIDENCE_INPUT" ]]; then
  echo "Release evidence directory not found: $EVIDENCE_INPUT" >&2
  exit 1
fi
EVIDENCE_DIR="$(cd -- "$EVIDENCE_INPUT" && pwd)"

required_files=(
  SHA256SUMS
  artifact-secrets.json
  image.tar.gz
  metadata.json
  provenance.intoto.json
  sbom.cdx.json
  vulnerabilities.json
)
for file in "${required_files[@]}"; do
  if [[ ! -f "$EVIDENCE_DIR/$file" ]]; then
    echo "Missing release evidence file: $file" >&2
    exit 1
  fi
done

if [[ -f "$EVIDENCE_DIR/licenses.json" ]]; then
  BUILD_SCRIPT="scripts/release-candidate.sh"
  checksummed_files=(
    artifact-secrets.json
    image.tar.gz
    licenses.json
    metadata.json
    provenance.intoto.json
    sbom.cdx.json
    vulnerabilities.json
  )
else
  BUILD_SCRIPT="scripts/verify-release-platforms.sh"
  checksummed_files=(
    artifact-secrets.json
    image.tar.gz
    metadata.json
    provenance.intoto.json
    sbom.cdx.json
    vulnerabilities.json
  )
fi

manifest_entries="$(awk 'NF { count += 1 } END { print count + 0 }' "$EVIDENCE_DIR/SHA256SUMS")"
assert_equal "checksum entry count" "${#checksummed_files[@]}" "$manifest_entries"
for file in "${checksummed_files[@]}"; do
  entry_count="$(awk -v expected="$file" '$2 == expected { count += 1 } END { print count + 0 }' "$EVIDENCE_DIR/SHA256SUMS")"
  assert_equal "checksum entry for $file" "1" "$entry_count"
done

(
  cd "$EVIDENCE_DIR"
  shasum -a 256 -c SHA256SUMS
)
bash scripts/verify-local-provenance.sh \
  "$EVIDENCE_DIR/provenance.intoto.json" \
  "$EVIDENCE_DIR/image.tar.gz" \
  "$EVIDENCE_DIR/metadata.json" \
  "$BUILD_SCRIPT"

image="$(jq -er '.image | strings | select(test("^[0-9A-Za-z][0-9A-Za-z._/:@-]{0,255}$"))' "$EVIDENCE_DIR/metadata.json")"
image_id="$(jq -er '.imageId | strings | select(test("^sha256:[0-9a-f]{64}$"))' "$EVIDENCE_DIR/metadata.json")"
platform="$(jq -er '.platform | strings | select(test("^linux/(amd64|arm64)$"))' "$EVIDENCE_DIR/metadata.json")"
revision="$(jq -er '.revision | strings | select(test("^[0-9a-f]{40}$"))' "$EVIDENCE_DIR/metadata.json")"
source="$(jq -er '.source | strings | select(test("^https://") and (test("\\s") | not))' "$EVIDENCE_DIR/metadata.json")"
version="$(jq -er '.version | strings | select(test("^[0-9A-Za-z][0-9A-Za-z._+-]{0,127}$"))' "$EVIDENCE_DIR/metadata.json")"

jq -e '
  (.tools | type == "object") and
  (.tools | keys | sort == ["gitleaks", "grype", "syft"]) and
  all(.tools[]; strings | test("@sha256:[0-9a-f]{64}$")) and
  (if has("architecture") then
    .architecture == (.platform | split("/")[1]) and
    (.emulated | type == "boolean") and
    (.hostArchitecture | strings | test("^(amd64|arm64)$"))
  else true end)
' "$EVIDENCE_DIR/metadata.json" >/dev/null
jq -e 'type == "array" and length == 0' \
  "$EVIDENCE_DIR/artifact-secrets.json" >/dev/null
jq -e '.bomFormat == "CycloneDX" and (.components | type == "array" and length > 0)' \
  "$EVIDENCE_DIR/sbom.cdx.json" >/dev/null
jq -e '
  (.matches | type == "array") and
  ([.matches[].vulnerability.severity
      | ascii_downcase
      | select(. == "high" or . == "critical")]
    | length == 0)
' "$EVIDENCE_DIR/vulnerabilities.json" >/dev/null
if [[ -f "$EVIDENCE_DIR/licenses.json" ]]; then
  jq -e 'type == "object" or type == "array"' \
    "$EVIDENCE_DIR/licenses.json" >/dev/null
fi
gzip -t "$EVIDENCE_DIR/image.tar.gz"

gzip -dc "$EVIDENCE_DIR/image.tar.gz" | docker load >/dev/null
assert_equal "image ID" "$image_id" \
  "$(docker image inspect --format '{{.Id}}' "$image")"
assert_equal "platform" "$platform" \
  "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image_id")"
assert_equal "runtime user" "node" \
  "$(docker image inspect --format '{{.Config.User}}' "$image_id")"
assert_equal "revision label" "$revision" \
  "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image_id")"
assert_equal "source label" "$source" \
  "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.source" }}' "$image_id")"
assert_equal "version label" "$version" \
  "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$image_id")"

if docker run --rm --platform "$platform" --entrypoint sh "$image_id" -c \
  'find /app -type f \( -name .env -o -name ".env.*" \) -print -quit' | grep -q .; then
  echo "The verified runtime image contains an environment file." >&2
  exit 1
fi
if ! docker image inspect "$image_id" | jq -e '
  .[0].Config.Env
  | map(split("=")[0])
  | any(test("(^|_)(TOKEN|PASSWORD|SECRET|DATABASE_URL|ACCESS_KEY)(_|$)"))
  | not
' >/dev/null; then
  echo "The verified runtime image contains a secret-shaped environment name." >&2
  exit 1
fi
docker run --rm --platform "$platform" --entrypoint node "$image_id" -e '
  require("sharp")({
    create: { width: 2, height: 2, channels: 3, background: "blue" },
  }).png().toBuffer().then((buffer) => {
    if (buffer.length === 0) process.exit(1);
  });
'

LIFECYCLE_BUILD=false LIFECYCLE_IMAGE="$image_id" \
  LIFECYCLE_PLATFORM="$platform" bash scripts/smoke-backup-restore.sh

echo "Release evidence verified for $version at $revision ($platform)."
