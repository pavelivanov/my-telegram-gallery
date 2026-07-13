#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 4 ]]; then
  echo "Usage: $0 PROVENANCE SUBJECT METADATA BUILD_SCRIPT" >&2
  exit 1
fi

PROVENANCE="$1"
SUBJECT="$2"
METADATA="$3"
BUILD_SCRIPT="$4"

for command in awk jq shasum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done
if [[ ! "$BUILD_SCRIPT" =~ ^scripts/[0-9A-Za-z._/-]+\.sh$ ]]; then
  echo "BUILD_SCRIPT must be a repository-relative shell script path." >&2
  exit 1
fi

for input in "$PROVENANCE" "$SUBJECT" "$METADATA"; do
  if [[ ! -f "$input" ]]; then
    echo "Missing provenance verification input: $input" >&2
    exit 1
  fi
done

created="$(jq -er '.created' "$METADATA")"
image="$(jq -er '.image' "$METADATA")"
platform="$(jq -er '.platform' "$METADATA")"
revision="$(jq -er '.revision' "$METADATA")"
source="$(jq -er '.source' "$METADATA")"
version="$(jq -er '.version' "$METADATA")"
subject_name="$(basename "$SUBJECT")"
subject_sha256="$(shasum -a 256 "$SUBJECT" | awk '{print $1}')"
build_type_uri="$source/blob/$revision/docs/releasing.md#local-release-build-type-v1"
builder_uri="$source/blob/$revision/$BUILD_SCRIPT#local-builder-v1"

jq -e \
  --arg buildType "$build_type_uri" \
  --arg builderId "$builder_uri" \
  --arg created "$created" \
  --arg gitUri "git+$source@$revision" \
  --arg image "$image" \
  --arg platform "$platform" \
  --arg revision "$revision" \
  --arg subjectName "$subject_name" \
  --arg subjectSha256 "$subject_sha256" \
  --arg version "$version" \
  '
    ._type == "https://in-toto.io/Statement/v1" and
    .predicateType == "https://slsa.dev/provenance/v1" and
    any(.subject[];
      .name == $subjectName and .digest.sha256 == $subjectSha256
    ) and
    .predicate.buildDefinition.buildType == $buildType and
    .predicate.buildDefinition.externalParameters == {
      image: $image,
      platform: $platform,
      version: $version
    } and
    .predicate.buildDefinition.internalParameters == {created: $created} and
    any(.predicate.buildDefinition.resolvedDependencies[];
      .uri == $gitUri and .digest.gitCommit == $revision
    ) and
    .predicate.runDetails.builder.id == $builderId and
    (.predicate.runDetails.metadata.startedOn |
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) and
    (.predicate.runDetails.metadata.finishedOn |
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) and
    .predicate.runDetails.metadata.startedOn <=
      .predicate.runDetails.metadata.finishedOn
  ' "$PROVENANCE" >/dev/null

echo "Local provenance verified for $subject_name at revision $revision."
