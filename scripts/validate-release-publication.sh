#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
REF="${2:-}"
CONFIRMATION="${3:-}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Publication requires a stable semantic version such as 0.1.0." >&2
  exit 1
fi
if [[ "$REF" != "refs/tags/v$VERSION" ]]; then
  echo "Dispatch the workflow from the exact immutable tag refs/tags/v$VERSION." >&2
  exit 1
fi
if [[ "$CONFIRMATION" != "PUBLISH GHCR RELEASE" ]]; then
  echo "The explicit publication confirmation phrase does not match." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Publication requires a clean Git checkout." >&2
  exit 1
fi

node scripts/check-license-policy.mjs
test "$(git rev-parse "v$VERSION^{commit}")" = "$(git rev-parse HEAD)"

echo "Publication request is bound to v$VERSION at $(git rev-parse HEAD)."
