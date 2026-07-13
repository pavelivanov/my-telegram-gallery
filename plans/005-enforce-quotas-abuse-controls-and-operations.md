# Plan 005: Enforce quotas and add abuse and operational controls

> **Executor instructions**: This plan turns tenant isolation into an operable
> service. Implement limits atomically and treat reconciliation discrepancies as
> production signals, not values to hide. Run all gates and update
> `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 9282d53..HEAD -- apps/api/prisma apps/api/src apps/admin/src apps/gallery/src scripts docs package.json pnpm-lock.yaml`
> Plans 001–004 must be complete. Compare their live model/guard names with this
> plan and stop on a material mismatch.

## Status

- **Priority**: P1
- **Effort**: L (6–8 days)
- **Risk**: HIGH
- **Depends on**: `plans/004-add-tenant-isolation-and-onboarding.md`
- **Category**: security, correctness, operations
- **Planned at**: commit `9282d53`, 2026-07-13; dirty working tree

## Why this matters

Tenant IDs prevent accidental data mixing, but a public SaaS also needs bounded
resource use, concurrency-safe admission, suspension/report paths, cleanup, and
restore procedures. The attached proposal suggests checking quotas at confirm
and accepting soft races; that is insufficient because direct uploads consume
storage before confirm and concurrent requests can exceed caps substantially.

Reserve bytes at upload-intent creation, verify actual stored bytes at confirm,
serialize quota mutations per tenant, and reconcile periodically. Ship a
small, explicit abuse/ops surface before billing invites paid content.

## Current state

Expected from Plans 002 and 004:

- UploadIntent is durable, expiring, tied to tenant+album, and confirmation is
  idempotent.
- `stat()` provides authoritative original object size and preview generation
  knows variant sizes.
- Tenant has `plan` and `status`, but no reliable usage reservation/counters.
- Public gallery reads and admin mutations already enforce tenant context.

Original evidence motivating the controls:

- `apps/api/src/photos/photos.service.ts:35-72` generates two stored variants;
  counting only the client-declared original size undercounts real storage.
- The original `backfillThumbs()` at lines 107-129 scans all missing variants
  serially; Plan 004 should scope it, but it still needs bounded jobs and usage
  accounting.
- Original `GET /albums` has no pagination; initial free/pro limits may keep it
  bounded, but the API must enforce those limits rather than assume them.
- Original `/api/health` was process-only; Plan 003 should provide dependency
  readiness that this plan can extend with job/usage signals.

## Product inputs required before merge

Define and approve a versioned plan-policy table. Defaults may begin with the
proposal's examples, but they are product decisions, not hard facts:

- Free: max tenants per owner, albums, photos, total stored bytes, upload bytes.
- Pro: the same fields at higher values.
- Grace duration after paid subscription expiry.
- Whether suspended galleries remain visible to owners (recommended: yes,
  read-only) and public viewers (recommended: no).

Keep policies in one typed module with tests. Do not scatter numeric constants
through guards/services. Prices belong to Plan 006, not this policy table.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Migration/E2E | `pnpm prisma:generate && pnpm test:e2e` | quota and abuse E2E pass |
| Focused tests | `pnpm --filter api test -- quota usage report throttle --runInBand` | all pass |
| Full gate | `pnpm check && pnpm build` | exit 0 |
| Reconcile dry run | `pnpm usage:reconcile -- --dry-run` | reports zero drift on fixture |
| Cleanup dry run | `pnpm uploads:cleanup -- --dry-run` | deterministic candidate report |

## Scope

**In scope**:

- Tenant/Photo/UploadIntent usage fields and one migration
- `apps/api/src/plans/*`, `quota/*`, `usage/*`, `reports/*`, `ops/*` (create)
- album/photo/upload services where admission/counters/status are enforced
- `apps/api/src/auth/*`, `main.ts`, `app.module.ts`, config/env
- admin usage/status/report summary UI
- gallery report action and suspended/not-found handling
- cleanup/reconcile CLI commands and root scripts
- structured request logging, request IDs, safe error handling
- security headers, body limits, trusted-proxy and rate-limit configuration
- health/readiness extensions
- `docs/operations.md`, `docs/abuse.md`, `docs/backups.md`
- focused unit/E2E/load-concurrency tests

**Out of scope**:

- Telegram Stars, plan upgrades from payments, refunds (Plan 006).
- Automated image classification/moderation.
- A full internal staff dashboard; CLI commands are acceptable for launch.
- Multi-region active-active, Redis, queues, or horizontal scaling beyond a
  documented single-replica launch limit.
- BYO bot, public web gallery, custom themes, collaborators.

## Git workflow

- Branch: `codex/005-saas-guardrails-ops`
- Separate commits for migration/accounting, abuse/rate controls, and runbooks.
- Do not modify a live tenant or deploy.

## Target accounting model

Add fields sufficient to distinguish committed and pending usage:

- Tenant: `storageUsedBytes`, `storageReservedBytes`, optional denormalized
  `albumCount`/`photoCount` only if maintained and reconciled.
- UploadIntent: `reservedBytes`, expiration/release timestamp.
- Photo: `storedBytes` equal to original + all generated variants, not just
  client file size.

Use `BigInt` in PostgreSQL and internal TypeScript. Serialize user-facing byte
counts as decimal strings or safe bounded numbers through explicit DTOs.

All admission/update operations must acquire a per-tenant database lock in a
transaction (for PostgreSQL, a row lock on Tenant is sufficient) before reading
policy/usage and updating counters. Do not rely on a process-local mutex.

## Steps

### Step 1: Add policy and usage accounting with a safe migration

1. Create typed `PlanPolicy` definitions and fail startup/tests if a policy has
   negative/inconsistent values.
2. Add usage fields above with zero defaults.
3. Backfill `Photo.storedBytes` conservatively from known DB data (at minimum
   original `size`) and then run a reconciliation command to stat known variant
   objects. The migration itself must not make unbounded network calls.
4. Backfill Tenant counters by SQL aggregation where possible.
5. Add a per-tenant transaction helper that locks Tenant before quota mutation.
6. Add drift metrics/log events rather than silently overwriting counters.

**Verify**: migration fixture totals match SQL aggregates; two concurrent test
transactions cannot both consume the last available capacity.

### Step 2: Reserve quota before bytes are uploaded

At UploadIntent creation, within the tenant lock transaction:

- enforce tenant status and plan;
- validate expected size <= per-file maximum;
- enforce album/photo count policy where relevant;
- require `used + reserved + expected <= storage limit`;
- increment reserved bytes and persist the same amount on the intent.

For direct upload, this prevents issuing a URL without capacity. For proxy
upload, additionally terminate the stream if it exceeds expected/global size.

At confirmation:

1. stat and probe original;
2. generate variants and capture their actual byte sizes;
3. reacquire tenant lock;
4. calculate actual stored total and recheck policy;
5. atomically release reservation, increment used bytes, create Photo, mark
   intent confirmed, and increment photo count if denormalized.

If actual storage exceeds remaining capacity, delete all objects, release the
reservation, and mark failed. Repeated confirmation must not double-count.

On expiry/failure, release reservation exactly once. On photo deletion,
decrement usage exactly once after the deletion state machine reaches its
defined committed point. If storage deletion fails, keep a retryable record and
do not falsely report reconciled state.

**Verify**: concurrent E2E covers last-byte race, oversized direct object,
confirm retry, expiry retry, and delete retry with exact final counters.

### Step 3: Enforce count limits and status at every mutation

- Tenant creation enforces per-owner tenant count.
- Album creation acquires tenant lock and enforces album count.
- Upload intent/confirm enforce photo and storage limits.
- Suspended tenant rejects uploads, creates, reorder, deletes, and billing
  checkout preparation; owner can view status/usage and export identifiers.
- Public reads of suspended tenant remain 404.
- Grace status (if represented separately) is still operable until grace end;
  Plan 006 will set dates, while this plan enforces them.

Return stable machine-readable error codes (`QUOTA_STORAGE`, `QUOTA_ALBUMS`,
`TENANT_SUSPENDED`) plus safe UI messages. Do not make frontends parse raw Nest
error strings.

**Verify**: policy table tests and E2E for each limit/status boundary pass.

### Step 4: Add bounded cleanup and reconciliation commands

Create idempotent CLI commands with `--dry-run`, `--tenant`, `--limit`, and
bounded batch iteration:

- `uploads:cleanup`: expire intents, delete known orphan objects, release
  reservations, retry failed cleanup.
- `usage:reconcile`: compare DB Photo objects/variant stats and usage counters;
  report drift, and require explicit `--apply` to repair counters.
- optional `media:backfill`: replace the owner-triggered unbounded endpoint with
  a bounded tenant-scoped CLI/job. Remove or strictly bound the UI button.

Commands must log IDs/types but never credentials, signed URLs, init data, or
object contents. Exit nonzero on unrecoverable failures.

Document recommended schedules. On Railway these may run as cron services; on
self-host they may run from host cron against `docker compose exec`. Do not
embed an in-memory timer that runs independently in every replica.

**Verify**: run each command twice on a fixture; second apply reports no work.

### Step 5: Add rate and request hardening

1. Add `@nestjs/throttler` with named limits for general reads, admin mutations,
   upload intent creation, and reports. At one replica the built-in store is
   acceptable; document that horizontal scaling requires a shared store before
   adding replicas.
2. Configure proxy trust explicitly for Caddy/Railway before using forwarded IP
   headers. Never trust arbitrary `X-Forwarded-For` in local/direct traffic.
3. Prefer validated Telegram user/tenant tracking where guard order makes it
   reliable; otherwise use trusted client IP plus application quota. Do not
   duplicate Telegram signature parsing in the throttler.
4. Set global/request-specific body limits. Raw/proxy upload route uses the
   streaming limit from Plan 002 rather than the JSON body parser.
5. Add request IDs propagated to structured logs and responses. Redact
   Authorization headers, init data, signed media query strings, bot tokens,
   object-store credentials, and database URLs.
6. Return generic production errors while retaining request ID in logs.

**Verify**: tests get 429 at configured boundaries, distinct trackers do not
collide accidentally, and log capture contains none of the seeded secret text.

### Step 6: Add abuse reporting and suspension operations

Add a minimal `Report` model containing reporter Telegram ID, tenant ID,
optional album/photo ID, reason enum, free-text detail with a strict length,
status, timestamps, and staff note. Prevent mass duplicate open reports per
reporter/target and rate-limit creation.

Gallery: add a small report action using existing UI language. Admin owner can
see that a gallery is suspended but cannot resolve reports against itself.

Ops CLI/API restricted by a separate operator secret/allowlist (not tenant
owner auth) must support:

- list open reports in bounded pages;
- suspend/unsuspend tenant with reason/audit record;
- resolve/dismiss report;
- inspect safe tenant usage metadata.

Prefer a CLI for launch if no staff identity system exists. Never expose the
operator secret to a frontend.

**Verify**: non-operator cannot call ops actions; suspension is audited and
immediately enforced; report text is not reflected as HTML.

### Step 7: Write and exercise operational runbooks

Create:

- `docs/operations.md`: deploy/migration order, readiness, cleanup schedules,
  log/request-ID workflow, scaling limitation, incident actions.
- `docs/backups.md`: Postgres and media backup ownership, retention, encryption,
  and a quarterly restore drill. A backup is not “done” until restore is tested.
- `docs/abuse.md`: report intake, response targets, suspension, takedown, appeal,
  data preservation/deletion, and contact path.

Add a staging launch checklist: restore test, usage reconcile zero drift,
cleanup zero stale reservations, isolation E2E, rate test, suspension smoke.

**Verify**: rehearse on a disposable environment and record commands/expected
results in the docs; no production mutation in this plan.

## Test plan

- Transactional concurrency tests against real PostgreSQL, not mocked Prisma.
- Storage totals include original, thumb, and preview bytes.
- Direct upload cannot bypass reservation by lying about size.
- Cleanup/reconcile are idempotent and tenant-bounded.
- Every quota returns a stable code and leaves DB/storage consistent.
- Rate limits and report duplicate suppression.
- Suspend/unsuspend audit and public/admin behavior.
- Log redaction with seeded fake secrets.

## Done criteria

- [ ] `pnpm check && pnpm build` exits 0.
- [ ] Concurrency E2E proves hard limit admission under parallel requests.
- [ ] `storageUsedBytes + storageReservedBytes` reconciles to fixture storage.
- [ ] Cleanup/reconcile dry runs and idempotent apply tests pass.
- [ ] Suspended tenants cannot mutate and are hidden publicly.
- [ ] Report and operator actions are rate-limited, audited, and tested.
- [ ] Logs contain no auth/init-data/storage/DB secrets.
- [ ] Backup restore drill and abuse runbook are documented.
- [ ] Single-replica limitation for in-memory throttling is explicit.
- [ ] Only in-scope files plus `plans/README.md` changed.

## STOP conditions

Stop and report if:

- Approved Free/Pro limits and grace semantics are unavailable.
- Quota updates cannot be serialized in PostgreSQL without bypass paths.
- The implementation would count declared bytes instead of actual stored bytes.
- Cleanup can release a reservation twice or delete a confirmed photo.
- A shared rate-limit store is required for an already multi-replica launch;
  design the shared store explicitly before proceeding.
- Operator actions would be reachable with ordinary tenant-owner auth.

## Maintenance notes

- Adding a new stored variant requires updating `Photo.storedBytes`, cleanup,
  and reconciliation together.
- Plan changes must be versioned; changing limits can make existing tenants over
  quota. Define whether that blocks new writes or triggers a grace path.
- Plan 006 must only change paid entitlement fields from verified, idempotent
  Telegram payment events.
- Revisit throttler storage before increasing replicas beyond one.
