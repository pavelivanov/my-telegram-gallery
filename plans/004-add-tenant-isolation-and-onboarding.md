# Plan 004: Add database-enforced tenant isolation and in-app onboarding

> **Executor instructions**: Treat tenant isolation as a security boundary.
> Follow the ordered migration, service, and test steps exactly. Never satisfy a
> failing isolation test by weakening authorization or returning cross-tenant
> records. Update `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 9282d53..HEAD -- apps/api/prisma apps/api/src/auth apps/api/src/albums apps/api/src/photos apps/api/src/storage apps/admin/src apps/gallery/src apps/api/.env.example`
> Plans 001–003 are expected to have changed these paths. Compare the concepts,
> not just the original line numbers. Stop if those plans are not complete.

## Status

- **Priority**: P1
- **Effort**: L (6–9 days)
- **Risk**: HIGH
- **Depends on**: `plans/003-package-a-single-origin-self-hosted-edition.md`
- **Category**: security, architecture, direction
- **Planned at**: commit `9282d53`, 2026-07-13; dirty working tree

## Why this matters

The app is globally single-tenant: every album/photo query is unscoped, one env
ID controls all writes, and the shared bot token authenticates identity but not
gallery ownership. SaaS requires more than adding `tenantId` to a model: the
database relationships, every mutation, upload intent, object key, and admin UI
must agree on the same tenant.

This plan keeps `TENANCY_MODE=single` as the self-host default and adds
`TENANCY_MODE=multi` for the hosted product. It uses a shared bot only; BYO-bot
tokens and encryption are explicitly deferred.

## Current state

- `apps/api/prisma/schema.prisma:11-35` models only `Album -> Photo`; both IDs
  and object keys are globally unique.
- `apps/api/src/albums/albums.service.ts:16-95` creates, lists, reads, and
  reorders without an ownership predicate.
- `apps/api/src/photos/photos.service.ts:22-27,75-153` looks up albums/photos by
  global ID. Plan 002 should have replaced confirm-by-key with an UploadIntent,
  but the intent is initially related only to an album.
- `apps/api/src/auth/admin.guard.ts:19-26` authorizes against env IDs.
- `apps/gallery/src/index.tsx:22-31` already maps signed launch parameter
  `album_<id>` into the album route. Preserve this link so existing shares keep
  working.
- The gallery list currently calls `/albums` with no gallery selector, and the
  admin opens directly onto the global album list.
- Telegram passes `startapp` into signed init-data `start_param`; the public
  `tgWebAppStartParam` is useful for early navigation but must not be treated as
  independently authenticated. Plan 001 should expose the signed server value.

## Decisions fixed by this plan

1. One codebase and schema; no self-host/SaaS fork.
2. `TENANCY_MODE=single|multi`, default `single`.
3. Shared production bot for the first SaaS release; no `Tenant.botToken` yet.
4. Explicit tenant selection is untrusted input. Admin access always checks a
   database membership for the validated Telegram user.
5. Existing album deep links remain `album_<albumId>` because album IDs are
   globally unique and map to a tenant server-side. Gallery-home links use
   `tenant_<slug>`. Constrain slugs/parameters to Telegram-supported ASCII and
   a conservative length under 64 characters.
6. New object keys use `tenants/<tenantId>/...`; existing keys are not moved.
   Database predicates, not prefixes alone, enforce isolation.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Generate/migrate | `pnpm prisma:generate && pnpm test:e2e` | migration and isolation E2E pass |
| Focused tests | `pnpm --filter api test -- tenant albums photos --runInBand` | all pass |
| Full gate | `pnpm check && pnpm build` | exit 0 |
| Migration SQL review | `pnpm --filter api exec prisma migrate diff ...` | no unexplained destructive change |

## Scope

**In scope**:

- `apps/api/prisma/schema.prisma` and one reviewed data migration
- `apps/api/src/tenants/*` (create)
- `apps/api/src/auth/*`
- `apps/api/src/albums/*`
- `apps/api/src/photos/*`
- `apps/api/src/media/*` and storage key generation from Plan 002
- `apps/api/src/app.module.ts`, config, env example
- `apps/api/src/cli/bootstrap-tenant.ts` and root script (create)
- admin tenant selector/onboarding screens, API client/context/types/routes
- gallery tenant launch/context/error state, API client/types/query keys/routes
- public config/share-link helper from Plan 003
- focused unit/E2E tests
- docs for modes, migration, and bootstrap command

**Out of scope**:

- Quotas/counters/rate limits/abuse reports (Plan 005).
- Telegram Stars or webhook processing (Plan 006).
- BYO bot/white-label, bot token storage, custom domains, themes, collaborator
  invitations, or public web galleries.
- Moving existing media objects to new prefixes.
- Making galleries accessible without Telegram authentication.

## Git workflow

- Branch: `codex/004-tenant-core`
- Commit migration first only after reviewing generated SQL; then API isolation;
  then UI onboarding.
- Do not deploy the migration until backup/restore has been rehearsed.

## Target data model

Use Prisma names consistent with the codebase, with these minimum concepts:

- `Tenant`: `id`, unique normalized `slug`, `name`, `status`, `plan`, timestamps.
- `TenantMembership`: composite unique `(tenantId, tgUserId)`, role `OWNER` for
  now; store Telegram IDs as PostgreSQL `BIGINT`/Prisma `BigInt` and never
  serialize raw BigInt through JSON.
- `Album.tenantId`: required.
- `Photo.tenantId`: required despite derivability, so quota and isolation
  queries are direct.
- `UploadIntent.tenantId`: required.

Enforce consistency in the database, not only TypeScript:

- make `(Album.id, Album.tenantId)` unique;
- relate Photo and UploadIntent to Album through `(albumId, tenantId)` composite
  foreign keys where Prisma/PostgreSQL support it;
- index tenant list/order paths (`Tenant.slug`, `(tenantId, createdAt)`,
  `(tenantId, albumId, position)`, membership user lookup).

## Steps

### Step 1: Land a backward-compatible tenant migration

1. Add enums and tables above.
2. Insert a stable default tenant in SQL (for example ID `tenant_default`, slug
   `default`) before adding non-null foreign keys.
3. Add nullable tenant IDs, backfill every existing Album, Photo, and
   UploadIntent through their relationships, assert no nulls, then set NOT NULL
   and add foreign keys/indexes.
4. Add composite constraints so a photo/intent cannot reference an album under
   another tenant.
5. Do not create a membership from an environment value inside SQL. Add an
   explicit idempotent CLI command to assign the default tenant owner after
   deploy:
   `pnpm tenant:bootstrap --slug default --owner-tg-id <id>`.
6. The command must refuse to replace a different owner without an explicit
   separate transfer operation (not part of this plan).

Test the migration both on an empty database and a fixture database containing
an album, photos, variants, and pending/confirmed upload intents.

**Verify**: `pnpm test:e2e` -> migration fixture retains all rows and
relationships; SQL checks find zero null tenant IDs and zero cross-tenant
relations.

### Step 2: Introduce a typed tenant context and mode-aware guards

Create a request tenant context/decorator passed explicitly from controller to
service. Do not hide security-critical scope only in AsyncLocalStorage.

Resolution rules:

- `single`: use the stable default tenant. Admin writes use `ADMIN_TG_IDS` from
  Plan 001; no membership is required for normal self-host upgrades.
- `multi` gallery list: accept normalized tenant slug from explicit route/header
  derived by the frontend from `tenant_<slug>`; active galleries are readable
  to any valid Telegram user. The slug is a selector, not proof of access.
- `multi` album deep link: resolve globally unique album ID, require its tenant
  to be active, and return tenant slug for navigation. All related photo queries
  still include the resolved tenant ID.
- `multi` admin: require selected tenant slug/ID, load membership by validated
  `tgUser.id`, require OWNER, and require active tenant.
- Suspended/missing public galleries return 404; admin owners receive a clear
  forbidden/suspended response without leaking other tenants.

`start_param` can select navigation but never bypass membership. Reject stale
init data through Plan 001 before resolving a tenant.

**Verify**: guard unit tests cover every mode/rule and show a forged
`X-Tenant-Slug` cannot grant admin access.

### Step 3: Scope every data and object operation

Change service signatures to require tenant context for all non-bootstrap work.
For each operation:

- list/create Album: `tenantId` predicate/data;
- get Album: public deep-link resolution followed by tenant-scoped photo query;
- reorder: fetch album and every photo under the same tenant, then update;
- create UploadIntent: tenant-scoped album and `tenants/<tenantId>/...` key;
- confirm: intent, album, photo, and transaction all share tenant ID;
- backfill variants: scope to selected tenant; it must no longer scan all SaaS
  photos from an owner action;
- delete Photo/media lookup: include tenant ID or first resolve public photo and
  verify tenant active;
- signed proxy media URL: bind tenant ID in the signature/message even though
  the request path exposes only photo ID.

Prefer composite `findUnique` inputs where available and `findFirst`/`updateMany`
with explicit tenant predicates otherwise. Never fetch by global ID and then
mutate before checking tenant.

Add a review test that searches critical Prisma calls and a human checklist;
regex is supplemental, not a replacement for E2E.

**Verify**: a two-tenant E2E matrix proves tenant A cannot read/mutate/reorder/
delete/confirm tenant B records, even with valid IDs and upload IDs.

### Step 4: Add tenant CRUD and admin onboarding

Add mode-aware admin endpoints:

- list tenants owned by current Telegram user;
- create tenant from name + requested slug;
- get selected tenant summary.

Normalize slug to lowercase ASCII with a conservative grammar such as
`[a-z0-9][a-z0-9_]{2,29}`; reserve `admin`, `api`, `default`, and product/system
names. Perform uniqueness in the database and translate conflicts to 409.
Create Tenant and OWNER membership atomically. Do not permit choosing owner ID
from the request body.

Admin UI in multi mode:

1. With no owned tenant, show “Create your gallery”.
2. With one tenant, select it automatically.
3. With multiple, show a compact tenant switcher.
4. Store only the selected slug in session/local state; server membership is
   authoritative on every write.
5. After creation, show gallery home share link and proceed to empty album list.

Single mode must continue opening the current album screen without onboarding.

**Verify**: E2E proves caller becomes owner, cannot set another owner, duplicate
slug returns 409, and single-mode current endpoints still work.

### Step 5: Make gallery launch and sharing tenant-aware

Update gallery bootstrap/context:

- `tenant_<slug>` opens that tenant's album list.
- existing `album_<id>` opens the album and learns tenant slug from the API.
- no start param in single mode opens default gallery.
- no start param in multi mode shows a neutral “Open a gallery link” state; it
  must not select the first tenant.

Include tenant slug in React Query keys (`['tenant', slug, 'albums']`) so
session-lifetime caching from `apps/gallery/src/components/Root.tsx:6-18` never
reuses one gallery's data in another. Admin caches/state must do the same.

Use the runtime bot/app config from Plan 003 to create:

- home link `.../galleryShortName?startapp=tenant_<slug>`;
- album link `.../galleryShortName?startapp=album_<albumId>`.

The API must validate that generated parameters meet Telegram-compatible
length/character constraints. Keep link generation centralized and tested.

**Verify**: frontend tests or a small pure-function suite covers parsing and
link creation; typecheck/lint/build both apps; manually open tenant and album
links in Telegram staging.

### Step 6: Document and rehearse mode transitions

Document:

- self-host default remains `single`;
- existing deployments migrate into `tenant_default` automatically;
- the explicit owner bootstrap command required before switching an existing
  deployment to `multi`;
- rollback limitations after creating multiple tenants;
- no BYO-bot support yet.

Add a release runbook: backup -> migrate while still single -> verify ->
bootstrap owner -> enable multi in staging -> run isolation smoke -> production.

**Verify**: follow the runbook on a disposable copy of the fixture database.

## Test plan

Use at least tenants A and B, owners A and B, viewer V, and non-owner X.

- A/B album lists never mix.
- X can read active public gallery data with valid Telegram auth but cannot use
  any admin mutation.
- Owner A plus B IDs receives 404/403 and B remains unchanged.
- Cross-tenant photo reorder list is rejected atomically.
- Upload created for A cannot confirm into B.
- Proxy media signature/photo combination cannot be swapped across tenants.
- Suspended tenant disappears from gallery but owner gets explicit admin state.
- Single mode reproduces existing behavior.
- Migration fixture retains and serves default-tenant content.

## Done criteria

- [ ] `pnpm check && pnpm build` exits 0.
- [ ] Empty and populated database migrations pass.
- [ ] Database constraints reject cross-tenant Album/Photo/UploadIntent links.
- [ ] Two-tenant E2E matrix passes every read and write isolation case.
- [ ] No admin authorization trusts `start_param` or a tenant header alone.
- [ ] Every gallery/admin cache key includes tenant identity where applicable.
- [ ] Existing `album_<id>` shares keep working.
- [ ] Single mode is the default and needs no database membership for env admins.
- [ ] No bot token is stored in Tenant.
- [ ] Only in-scope files plus `plans/README.md` changed.

## STOP conditions

Stop and report if:

- Generated migration SQL drops data, rebuilds large tables without a reviewed
  rollout, or cannot guarantee non-null tenant IDs.
- Prisma cannot express the intended composite relation safely; propose and
  review explicit SQL constraints rather than omitting the boundary.
- Any service would need to infer tenant implicitly after an unscoped mutation.
- Multi mode would auto-assign ownership from an unvalidated request field.
- The start parameter scheme would exceed Telegram limits for valid records.
- Plans 001–003 are incomplete or their interfaces differ materially.

## Maintenance notes

- New tenant-owned tables must always carry tenant ID and an isolation test.
- Future collaborator admins should extend `TenantMembership.role`; do not add a
  second authorization system.
- BYO bot is a separate design requiring encrypted tokens, rotation, validation
  key caching, and per-bot webhooks. Do not sneak it into this plan.
- Plan 005 adds usage fields and tenant status enforcement details; Plan 006
  changes plan only from verified payment events.
