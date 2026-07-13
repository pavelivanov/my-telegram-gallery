#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
This per-service Railway environment helper is retired as of 2026-07-13.
Configure the single root Dockerfile service with the variables documented in
.env.selfhost.example. Do not create separate api/admin/gallery services.
EOF
exit 2
