# One-service Railway template preparation

This document prepares a future source-based Railway template. It does not
create a Railway project, deploy code, publish a marketplace template, or
contain credentials.

## Required topology

The template source must be the reviewed public repository root and must create:

1. one application service built by the root `Dockerfile`;
2. one managed PostgreSQL service;
3. either one Railway S3-compatible bucket or a documented external S3/R2
   choice.

Do not restore separate API, admin, and gallery services. The one application
serves `/`, `/admin/`, and `/api`, uses the root `railway.json`, runs Prisma
migrations through its pre-deploy command, and checks `/api/health/ready`.
`RUN_MIGRATIONS_ON_START` must be `false` because pre-deploy owns migrations.

## Variable wiring

Use Railway variable references and generated secrets, never literal
credentials in template defaults.

| Application variable | Template source |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `RUN_MIGRATIONS_ON_START` | `false` |
| `STORAGE_DRIVER` | `s3` when a bucket is included |
| `STORAGE_TRANSFER_MODE` | `proxy` initially |
| `S3_ENDPOINT` | generated bucket `AWS_ENDPOINT_URL` reference |
| `S3_REGION` | generated bucket `AWS_DEFAULT_REGION` reference |
| `S3_BUCKET` | generated bucket `AWS_S3_BUCKET_NAME` reference |
| `S3_ACCESS_KEY_ID` | generated bucket `AWS_ACCESS_KEY_ID` reference |
| `S3_SECRET_ACCESS_KEY` | generated bucket `AWS_SECRET_ACCESS_KEY` reference |
| `S3_FORCE_PATH_STYLE` | derive from the bucket URL-style setting; do not guess |

Railway resource names are case-sensitive in variable references. Confirm the
actual PostgreSQL and bucket names in the template editor, then select their
generated references rather than copying displayed credential values.

Human inputs are limited to the public domain/bot identity, bot token, Mini App
short names, administrator IDs, tenancy mode, and independently generated media
signing secret. Billing inputs stay blank/test-only until Plan 006 and the legal
launch gate pass. Never expose any secret as a Vite build variable.

## Disposable acceptance run

After the repository and template are approved for external testing:

- deploy into a new non-production Railway project/environment;
- confirm exactly one application service plus PostgreSQL and the chosen bucket;
- observe terminal deployment `SUCCESS`, then verify readiness and liveness;
- open both Mini App paths and complete proxy upload, confirmation, media read,
  delete, restart persistence, and tenant-isolation smoke;
- verify the Prisma pre-deploy command ran once and startup did not rerun it;
- inspect logs/template defaults for credential values;
- rehearse an upstream source update and rollback;
- delete the disposable project and confirm bucket/database teardown.

Do not claim success from a queued build. Marketplace publication requires an
explicit operator approval, an already-public reviewed repository, and current
Railway terms revalidation.
