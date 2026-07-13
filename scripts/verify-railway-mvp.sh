#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
This verifier targets the retired three-service Railway topology and is no
longer supported as of 2026-07-13. Use /api/health/ready on the single app
service and the verification commands documented in README.md.
EOF
exit 2
