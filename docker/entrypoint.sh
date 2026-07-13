#!/bin/sh
set -eu

case "${RUN_MIGRATIONS_ON_START:-false}" in
  true)
    echo "Applying database migrations..."
    node /app/node_modules/prisma/build/index.js migrate deploy
    ;;
  false)
    ;;
  *)
    echo "RUN_MIGRATIONS_ON_START must be true or false" >&2
    exit 1
    ;;
esac

exec "$@"
