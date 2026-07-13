# Gallery API

The NestJS API authenticates Telegram Mini App init data and owns tenancy,
owner/collaborator authorization, albums, photos, storage, media delivery,
quotas, abuse reports, operator tools, and Telegram Stars billing. PostgreSQL is
authoritative; photo bytes use either the filesystem or S3-compatible storage.

## Local development

From the repository root:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm prisma:migrate
pnpm dev:api
```

Use Node.js 24 and pnpm 10. Prisma generates its client into
`apps/api/generated/prisma`; `pnpm install` and `pnpm prisma:generate` both keep
it current.

## Verification

```bash
pnpm --filter api lint
pnpm --filter api test --runInBand
pnpm test:e2e
pnpm build:api
```

The API is deployed only as part of the root application image. See the root
[README](../../README.md), [self-hosting guide](../../docs/self-hosting.md),
[operations guide](../../docs/operations.md), and
[billing runbook](../../docs/billing.md) for supported configuration and
deployment procedures. Optional Sentry error capture is initialized before
NestJS only when a DSN is configured; its privacy and staging-verification
requirements are documented in the operations guide.
