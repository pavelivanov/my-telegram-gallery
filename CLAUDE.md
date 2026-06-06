# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

Two Telegram Mini Apps sharing one API: **admin** uploads photos, **gallery** shows them.

- `apps/admin/` — Mini App for the admin: upload, delete, reorder photos (React + Vite, TMA template)
- `apps/gallery/` — Mini App for everyone: browse albums/photos (React + Vite, TMA template)
- `apps/api/` — NestJS API: Prisma (PostgreSQL), Cloudflare R2 storage (presigned URLs), Telegram init-data auth
- `scripts/` — Railway deploy/env helpers, e2e DB prep

pnpm workspace monorepo (`pnpm-workspace.yaml`, packages: `apps/*`). Node >= 22, pnpm 10.

## Commands

Run from repo root:

```bash
pnpm dev:admin          # admin app dev server (vite)
pnpm dev:gallery        # gallery app dev server (vite)
pnpm dev:api            # API in watch mode (nest start --watch)
pnpm build:admin        # tsc --noEmit && vite build
pnpm build:gallery      # tsc --noEmit && vite build
pnpm build:api          # nest build
pnpm prisma:generate    # regenerate Prisma client (output: apps/api/generated/)
pnpm prisma:migrate     # prisma migrate dev
```

## Architecture notes

- All API endpoints require `Authorization: tma <initDataRaw>`; one `TELEGRAM_BOT_TOKEN` validates both apps. Write endpoints additionally require caller's Telegram id == `ADMIN_TG_ID`.
- Upload flow: `POST /api/photos/upload` (presigned PUT URL) → client PUTs file directly to R2 → `POST /api/photos/confirm` (persist record).
- Prisma client is generated into `apps/api/generated/` (gitignored) — run `pnpm prisma:generate` after schema changes or fresh install.

## Deployment rules

- **NEVER deploy to Railway automatically.** Do not run `railway up`, `railway redeploy`, `scripts/railway-deploy.sh`, or any other deploy command on your own. Deployment is done manually by the user only.
- Suggesting deploy steps or preparing changes for deploy is fine; executing them is not — even after a successful build or when a task "feels done".
- Read-only Railway commands (`railway status`, `railway logs`, `railway variables`) are OK for debugging.
