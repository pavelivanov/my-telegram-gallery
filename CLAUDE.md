# CLAUDE.md

Repository guidance for coding agents.

## Project overview

This pnpm monorepo builds one self-hostable Telegram gallery application:

- `apps/admin/` — React/Vite owner Mini App under `/admin/`
- `apps/gallery/` — React/Vite visitor Mini App under `/`
- `apps/api/` — NestJS/Prisma API under `/api/`
- `docs/` — self-hosting, tenancy, operations, billing, and release runbooks
- `scripts/` — verification, initialization, maintenance, and release helpers

Use Node.js 24 and pnpm 10.

## Commands

Run from the repository root:

```bash
pnpm dev:admin
pnpm dev:gallery
pnpm dev:api
pnpm prisma:generate
pnpm prisma:migrate
pnpm test
pnpm test:e2e
pnpm check
pnpm build
```

## Architecture notes

- Telegram Mini App init data is the authentication boundary. Protected calls
  use `Authorization: tma <initDataRaw>`.
- `single` tenancy authorizes writes with `ADMIN_TG_IDS`; `multi` tenancy uses
  database-backed tenant owners. Every mutable record, object key, quota, and
  signed media URL is tenant scoped.
- Storage supports local filesystem or S3-compatible services. Proxy transfers
  are the self-hosting default; direct S3 transfers require reviewed CORS and
  credentials.
- Uploads use server-created intents, then proxy or direct transfer, then
  authoritative confirmation. Clients never choose storage keys.
- PostgreSQL transactions and tenant locks protect quota and billing authority.
  Telegram webhooks are deduplicated durably.
- Production is one application image plus PostgreSQL, optionally behind the
  included Caddy Compose service.
- Prisma generates into `apps/api/generated/prisma` (gitignored). Regenerate
  after schema changes or a fresh install.

## Completion workflow

- When an in-scope task is complete and its relevant verification passes,
  inspect the final diff, stage only the task's changes, create a descriptive
  commit, and push the current branch to its configured upstream automatically.
- If the worktree has no task changes, do not create an empty commit. Push only
  when the current branch contains unpushed commits.
- Never force-push, rewrite shared history, commit secrets/generated release
  evidence, or include unrelated user changes. If a safe commit or push cannot
  complete, preserve the work and report the exact blocker.
- Report the resulting commit hash and pushed branch at handoff.
- A routine source-code push does not authorize a deployment, release tag,
  registry/package publication, repository visibility change, or other
  external launch action; those remain governed by the deployment rules below.

## Deployment rules

- Never deploy, publish, change DNS, configure BotFather/webhooks, or push a
  release image without the user's explicit approval.
- In particular, do not run `railway up`, `railway redeploy`, or retired
  Railway helper scripts automatically. Read-only infrastructure inspection is
  acceptable when relevant.
- Preparing deployment configuration and documenting commands is acceptable.
- Public distribution also requires the pending license, ownership, security,
  signing, and clean-environment acceptance gates in
  `docs/release-readiness.md`.
