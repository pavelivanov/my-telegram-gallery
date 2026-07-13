#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 6 ]]; then
  echo "Usage: $0 OUTPUT SUBJECT METADATA BUILD_SCRIPT STARTED_ON FINISHED_ON" >&2
  exit 1
fi

OUTPUT="$1"
SUBJECT="$2"
METADATA="$3"
BUILD_SCRIPT="$4"
STARTED_ON="$5"
FINISHED_ON="$6"

for command in awk jq shasum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

for input in "$SUBJECT" "$METADATA"; do
  if [[ ! -f "$input" ]]; then
    echo "Missing provenance input: $input" >&2
    exit 1
  fi
done
if [[ ! "$BUILD_SCRIPT" =~ ^scripts/[0-9A-Za-z._/-]+\.sh$ ]]; then
  echo "BUILD_SCRIPT must be a repository-relative shell script path." >&2
  exit 1
fi
for timestamp in "$STARTED_ON" "$FINISHED_ON"; do
  if [[ ! "$timestamp" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    echo "Provenance timestamps must use UTC RFC 3339 seconds." >&2
    exit 1
  fi
done

created="$(jq -er '.created | strings | select(length > 0)' "$METADATA")"
image="$(jq -er '.image | strings | select(length > 0)' "$METADATA")"
platform="$(jq -er '.platform | strings | select(length > 0)' "$METADATA")"
revision="$(jq -er '.revision | strings | select(test("^[0-9a-f]{40}$"))' "$METADATA")"
source="$(jq -er '.source | strings | select(test("^https://"))' "$METADATA")"
version="$(jq -er '.version | strings | select(length > 0)' "$METADATA")"
subject_name="$(basename "$SUBJECT")"
subject_sha256="$(shasum -a 256 "$SUBJECT" | awk '{print $1}')"
build_type_uri="$source/blob/$revision/docs/releasing.md#local-release-build-type-v1"
builder_uri="$source/blob/$revision/$BUILD_SCRIPT#local-builder-v1"

mkdir -p "$(dirname "$OUTPUT")"
jq -S -n \
  --arg buildType "$build_type_uri" \
  --arg builderId "$builder_uri" \
  --arg created "$created" \
  --arg finishedOn "$FINISHED_ON" \
  --arg gitUri "git+$source@$revision" \
  --arg image "$image" \
  --arg platform "$platform" \
  --arg revision "$revision" \
  --arg startedOn "$STARTED_ON" \
  --arg subjectName "$subject_name" \
  --arg subjectSha256 "$subject_sha256" \
  --arg version "$version" \
  '{
    "_type": "https://in-toto.io/Statement/v1",
    subject: [{name: $subjectName, digest: {sha256: $subjectSha256}}],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: {
        buildType: $buildType,
        externalParameters: {
          image: $image,
          platform: $platform,
          version: $version
        },
        internalParameters: {created: $created},
        resolvedDependencies: [{
          uri: $gitUri,
          digest: {gitCommit: $revision}
        }]
      },
      runDetails: {
        builder: {id: $builderId},
        metadata: {
          startedOn: $startedOn,
          finishedOn: $finishedOn
        }
      }
    }
  }' > "$OUTPUT"
