# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_IMAGE=node:24.17.0-alpine3.23@sha256:7c70d1235c0b4c2bc9eeed5393d19f1bbdde6885ba0d58ba62bb385d7b0f3ff1

FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /workspace

RUN apk add --no-cache openssl \
  && corepack enable \
  && corepack prepare pnpm@11.13.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json apps/admin/package.json
COPY apps/gallery/package.json apps/gallery/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY . .

RUN pnpm prisma:generate \
  && pnpm build \
  && pnpm --config.inject-workspace-packages=true --filter api deploy --prod /opt/api

FROM ${NODE_IMAGE} AS runtime

ARG BUILD_CREATED=1970-01-01T00:00:00Z
ARG BUILD_REVISION=unknown
ARG BUILD_SOURCE=unknown
ARG BUILD_SOURCE_URL=https://github.com/pavelivanov/my-telegram-gallery/tree/main
ARG BUILD_VERSION=0.0.0-dev

LABEL org.opencontainers.image.created="${BUILD_CREATED}" \
  org.opencontainers.image.base.digest="sha256:7c70d1235c0b4c2bc9eeed5393d19f1bbdde6885ba0d58ba62bb385d7b0f3ff1" \
  org.opencontainers.image.base.name="docker.io/library/node:24.17.0-alpine3.23" \
  org.opencontainers.image.description="Self-hostable Telegram gallery with admin, gallery, and API in one image" \
  org.opencontainers.image.licenses="AGPL-3.0-only" \
  org.opencontainers.image.revision="${BUILD_REVISION}" \
  org.opencontainers.image.source="${BUILD_SOURCE}" \
  org.opencontainers.image.title="my-telegram-gallery" \
  org.opencontainers.image.version="${BUILD_VERSION}"

ENV NODE_ENV=production \
  APP_SOURCE_URL="${BUILD_SOURCE_URL}" \
  APP_VERSION="${BUILD_VERSION}" \
  PORT=3000 \
  STATIC_ROOT=/app/static \
  FILESYSTEM_STORAGE_PATH=/data/media \
  RUN_MIGRATIONS_ON_START=false \
  CHECKPOINT_DISABLE=1 \
  PRISMA_HIDE_UPDATE_MESSAGE=true

RUN apk add --no-cache ca-certificates tini \
  && mkdir -p /app /data/media \
  && chown node:node /app /data/media

WORKDIR /app

COPY --from=build --chown=node:node /opt/api/ ./
COPY --from=build --chown=node:node /workspace/apps/api/dist/ ./dist/
COPY --from=build --chown=node:node /workspace/apps/api/generated/ ./generated/
COPY --from=build --chown=node:node /workspace/apps/gallery/dist/ ./static/gallery/
COPY --from=build --chown=node:node /workspace/apps/admin/dist/ ./static/admin/
COPY --chown=node:node --chmod=755 docker/entrypoint.sh /usr/local/bin/gallery-entrypoint

RUN rm -rf src test coverage /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx \
  && find . -name '*.spec.ts' -delete

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/ready').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/gallery-entrypoint"]
CMD ["node", "dist/src/main.js"]
