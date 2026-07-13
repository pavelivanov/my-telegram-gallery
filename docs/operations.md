# Operations runbook

This runbook covers the supported launch topology: one application replica,
PostgreSQL, and filesystem or S3-compatible media. It applies to self-hosted
single mode and hosted multi mode. Production changes require a backup and a
staging rehearsal first.

## Deploy and migrate

Treat the image, Prisma client, and committed migrations as one release:

1. Back up PostgreSQL, media, and configuration using
   [backups.md](backups.md).
2. Build the immutable image and apply `prisma migrate deploy` once.
3. Start or replace the single app replica.
4. Require `GET /api/health/ready` to return `200` before sending traffic.
5. Run upload cleanup dry-run and usage reconciliation dry-run.
6. Smoke one gallery read and one owner-authenticated mutation, then inspect
   structured logs by request ID.

Docker Compose performs steps 2–4 through the image entrypoint and healthcheck.
For Railway, keep migrations in the pre-deploy command and the app start command
separate. Never let every replica race to apply migrations.

Readiness checks PostgreSQL, object storage, and reports the count of stale,
unreleased upload reservations. A nonzero `staleUploadReservations` signal does
not hide the problem: run cleanup, investigate failures, and confirm it returns
to zero.

## Scheduled bounded jobs

The commands require an explicit mode, accept `--tenant SLUG`, and cap work with
`--limit`. They never run as in-process timers, so adding a replica cannot
silently duplicate schedules.

Preview candidates without changing storage or counters:

```bash
docker compose exec -T app node dist/src/cleanup-uploads \
  --dry-run --limit 500
docker compose exec -T app node dist/src/usage-reconcile \
  --dry-run --limit 500
```

Apply upload cleanup, then verify a second pass has no candidates:

```bash
docker compose exec -T app node dist/src/cleanup-uploads \
  --apply --limit 500
docker compose exec -T app node dist/src/cleanup-uploads \
  --apply --limit 500
```

Usage repair is never automatic. Inspect dry-run output first; missing objects
or an incomplete tenant scan exit nonzero and are not repairable by overwriting
counters. When the discrepancy is understood, apply and prove idempotence:

```bash
docker compose exec -T app node dist/src/usage-reconcile \
  --apply --tenant TENANT_SLUG --limit 10000
docker compose exec -T app node dist/src/usage-reconcile \
  --apply --tenant TENANT_SLUG --limit 10000
```

Recommended launch schedules:

- upload cleanup every 15 minutes;
- usage dry-run every hour and after storage incidents or migrations;
- billing expiry every hour, with a second apply proving idempotence;
- billing reconciliation every hour and after webhook/payment incidents;
- a deliberate usage `--apply` only after an operator reviews the drift event.

Use host cron with `flock` for Compose or one Railway cron service per command.
Do not add an application timer. Job output contains tenant/object record IDs and
event types, never init data, signed URLs, credentials, or object contents.

## Request IDs and logs

Every response has `X-Request-Id`. A safe caller-supplied ID is propagated;
otherwise the API creates one. Structured request logs contain request ID,
method, path without query string, status, duration, and validated tenant/user
identifiers when available. Exception logs redact configured bot, database,
media-signing, and storage secrets plus authorization/init-data and signed-query
patterns.

For an incident, capture the response request ID and search the centralized app
logs for that exact value. Do not paste authorization headers, Telegram init
data, signed media URLs, or environment dumps into tickets or chat.

## Proxy and rate-limit topology

`TRUST_PROXY_HOPS=0` is required when the API is reached directly. The supplied
Compose topology sets it to `1` because exactly one trusted Caddy proxy sits in
front. Railway should also use the explicitly verified hop count. Never raise it
to make arbitrary `X-Forwarded-For` values appear to work.

The general, admin, upload, and report rate profiles use the in-memory Nest
store. This is intentionally limited to **one app replica**. Before horizontal
scaling, design and test a shared rate-limit store and preserve the current
validated Telegram user + tenant tracker semantics. Adding replicas first would
multiply every effective limit.

## Operator CLI

There is no `/api/ops` route. Operator actions require shell/container access,
a separate `OPS_TOKEN`, its configured SHA-256 digest in `OPS_TOKEN_SHA256`, and
an `OPS_ACTOR` identity. Never use a tenant owner credential or expose the raw
operator token to either frontend.

Generate a random token in a secure operator shell, save the raw value in the
approved secret manager, and configure only its digest plus actor on the app:

```bash
export OPS_TOKEN="$(openssl rand -hex 32)"
node -e 'const c=require("node:crypto"); process.stdout.write(c.createHash("sha256").update(process.env.OPS_TOKEN).digest("hex")+"\n")'
```

Examples (the raw token is supplied only to the operator process):

```bash
docker compose exec -T -e OPS_TOKEN app node dist/src/ops-cli \
  reports list --limit 50
docker compose exec -T -e OPS_TOKEN app node dist/src/ops-cli \
  tenant inspect --tenant TENANT_SLUG
docker compose exec -T -e OPS_TOKEN app node dist/src/ops-cli \
  tenant suspend --tenant TENANT_SLUG --reason "Policy review"
docker compose exec -T -e OPS_TOKEN app node dist/src/ops-cli \
  report resolve --report REPORT_ID --note "Reviewed and resolved"
docker compose exec -T -e OPS_TOKEN app node dist/src/ops-cli \
  tenant unsuspend --tenant TENANT_SLUG --reason "Review complete"
docker compose exec -T -e OPS_TOKEN app node dist/src/ops-cli \
  payment refund --payment BILLING_PAYMENT_ID --reason "Approved support case"
```

Suspend/unsuspend and resolve/dismiss actions write `OperatorAudit` rows with
actor, reason, tenant, action, and timestamp in the same transaction as the
state change. Tenant owners can see status, usage, and an open-report count but
cannot inspect reporter detail or resolve reports.

## Incident actions

- **Storage unavailable:** stop uploads, preserve database rows/counters, restore
  storage access, then run cleanup and usage dry-runs. Do not decrement counters
  just to make readiness green.
- **Suspected cross-tenant access:** suspend affected tenants, preserve logs and
  backups, stop mutation traffic if scope is unknown, and run the isolation E2E
  before any reopen.
- **Quota drift:** record `tenant_usage_drift`, inspect missing objects and job
  completeness, repair the underlying storage/row issue, then use explicit
  reconciliation apply.
- **Abuse report:** follow [abuse.md](abuse.md); suspend first when continued
  public access creates material risk.
- **Database or media loss:** do not improvise counter repair. Follow the tested
  restore procedure in [backups.md](backups.md).
- **Payment mismatch:** pause new checkout if scope is unknown, preserve billing
  rows and webhook status, then follow [billing.md](billing.md). Never infer Pro
  from an invoice-close callback.

## Staging launch checklist

- [ ] Quarterly-style PostgreSQL + media restore drill succeeds.
- [ ] `usage-reconcile --dry-run` reports zero drift for every launch tenant.
- [ ] Cleanup apply followed by a second apply reports zero candidates.
- [ ] Tenant isolation and last-byte concurrency E2E pass.
- [ ] Report rate/duplicate tests and suspension smoke pass.
- [ ] One gallery report can be listed and resolved through the operator CLI.
- [ ] Seeded secret strings are absent from captured logs.
- [ ] `TRUST_PROXY_HOPS` matches the observed topology.
- [ ] Exactly one app replica is configured while throttling is in memory.
- [ ] Abuse contact and appeal path are published.
- [ ] Telegram test-environment billing checklist passes with approved product
      and support inputs; the production webhook remains unset until launch.

The repository rehearses migrations, cleanup idempotence, usage idempotence,
rate limits, reports, and operator audit behavior against disposable PostgreSQL
in `pnpm test:e2e`; it does not mutate production.
