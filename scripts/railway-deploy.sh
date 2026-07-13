#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
This three-service Railway deploy helper is retired as of 2026-07-13.
Deploy the repository root with railway.json and the single Dockerfile service.
See docs/self-hosting.md for the supported topology.
EOF
exit 2
