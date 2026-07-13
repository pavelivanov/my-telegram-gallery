# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22.17.0

FROM node:${NODE_VERSION}-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.29.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/gallery/package.json apps/gallery/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY . .

RUN pnpm build \
  && pnpm --filter api deploy --prod /opt/api

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production \
  PORT=3000 \
  STATIC_ROOT=/app/static \
  FILESYSTEM_STORAGE_PATH=/data/media \
  RUN_MIGRATIONS_ON_START=false \
  CHECKPOINT_DISABLE=1 \
  PRISMA_HIDE_UPDATE_MESSAGE=true

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app /data/media \
  && chown node:node /app /data/media

WORKDIR /app

COPY --from=build --chown=node:node /opt/api/ ./
COPY --from=build --chown=node:node /workspace/apps/api/dist/ ./dist/
COPY --from=build --chown=node:node /workspace/apps/api/generated/ ./generated/
COPY --from=build --chown=node:node /workspace/apps/gallery/dist/ ./static/gallery/
COPY --from=build --chown=node:node /workspace/apps/admin/dist/ ./static/admin/
COPY --chown=node:node --chmod=755 docker/entrypoint.sh /usr/local/bin/gallery-entrypoint

RUN rm -rf src test coverage \
  && find . -name '*.spec.ts' -delete

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/ready').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/gallery-entrypoint"]
CMD ["node", "dist/src/main.js"]
