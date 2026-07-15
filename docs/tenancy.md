# Tenancy modes and transition runbook

The same image supports a self-hosted single gallery and a hosted multi-gallery
service. `TENANCY_MODE=single` is the default. Both modes use the shared service
bot; multi mode can additionally connect one encrypted tenant-owned bot per
gallery. Ownership transfer is not supported.

## Mode behavior

### Single mode

- Migration `7_tenant_core` creates the stable `tenant_default` row and assigns
  every existing album, photo, preview reference, and upload intent to it.
- `ADMIN_TG_IDS` authorizes mutations. The default tenant does not need a
  membership row.
- Opening the gallery Mini App without a start parameter shows the default
  gallery, preserving existing self-host behavior.

### Multi mode

- Telegram init data still establishes identity. A tenant slug, header, or
  `start_param` only selects a gallery and never grants administrator access.
- Gallery-content mutations check an `OWNER` or `ADMIN` membership for the
  validated Telegram user. Billing, ownership, and membership changes require
  `OWNER`.
- `tenant_<slug>` opens a gallery home. Existing `album_<id>` links remain valid
  and resolve the album's tenant on the server.
- A launch without a tenant or album parameter stays neutral. It never selects
  the first tenant in the database.
- New media uses `tenants/<tenantId>/...`. Existing objects remain at their old
  keys and continue to work; the transition does not move media.

### Multi-mode gallery admission

`TENANT_CREATION_MODE` controls only `POST /api/tenants`; it never removes an
existing owner or collaborator's access. The default, `open`, preserves normal
multi-mode onboarding. `closed` blocks every new gallery. For a private beta,
use an explicit numeric Telegram-user allowlist:

```dotenv
TENANT_CREATION_MODE=allowlist
TENANT_CREATION_TG_IDS=501,502
```

Allowlist mode refuses to start when the list is empty or malformed. Changes
take effect after the application restarts. Removing an ID prevents that user
from creating another gallery but does not revoke existing memberships; use
the normal collaborator or operator procedures for revocation and suspension.

## Optional tenant-owned bots

When `TENANT_BOT_ENCRYPTION_KEYS` is configured, a multi-mode owner can open
**Bot** and connect a BotFather token plus the Admin and Gallery Mini App short
names. Telegram `getMe` verifies the token before the application encrypts it
with AES-256-GCM. The token is never returned by an API response.

Init data verified by a tenant token is bound to that tenant ID. A header,
`tenant_<slug>`, or `album_<id>` resolving elsewhere is rejected even when the
forged Telegram user would have membership there. Tenant list/detail and create
routes apply the same boundary, preventing one compromised tenant token from
becoming a service-wide identity oracle.

Custom Mini App links must retain their generated `startapp` selector. The
shared service bot remains available for recovery and tenant creation.
Connecting a bot does not register a webhook or move Stars billing to it. See
[tenant-bots.md](tenant-bots.md) for setup, key rotation, token rotation, and
incident guidance.

## Collaborator administrators

In multi mode, an owner can open **Team** in the administrator Mini App and add
up to 10 collaborators by numeric Telegram user ID. Usernames are intentionally
not used as authorization identities because they can change. An `ADMIN`
membership lets that validated Telegram user select the gallery and create,
upload, reorder, or delete its albums/photos.

Collaborators cannot view or change the team, access billing controls, replace
the owner, or manage another tenant. Owners cannot remove an owner membership;
only `ADMIN` rows can be revoked. Revocation is checked from PostgreSQL on every
subsequent mutation, so it does not depend on a long-lived application session.
The limit is enforced under the same tenant transaction lock used for quotas.

Single mode keeps its simpler trust model: every ID in `ADMIN_TG_IDS` has full
administrative authority over the default gallery. It does not expose the Team
screen or create membership rows.

## Gallery presentation presets

Both modes expose **Style** in the administrator Mini App. An owner or
collaborator administrator can preview and select Nocturne, Paper, or Moss; a
single-mode environment administrator can do the same for the default gallery.
The gallery loads its safe name and preset before rendering albums, including
when an `album_<id>` deep link resolves the tenant on the server.

Presets are an application enum, not stored CSS. The API rejects arbitrary
values, writes under the tenant lock, rechecks membership, and blocks changes
while a tenant is suspended. This keeps hosted tenants from injecting markup,
remote assets, fonts, or styles into another viewer's Mini App. Existing and
migrated tenants default to Nocturne, which preserves the original appearance.

## Optional public browser links

Gallery data stays Telegram-only by default. An owner can open **Web** in the
administrator Mini App and explicitly create a public browser link. The link
contains a random 192-bit identifier instead of the tenant slug; knowing a slug
never grants browser access. Collaborator administrators cannot view, enable,
or revoke this setting.

Anyone with an active link can view the gallery and albums without a Telegram
account and can submit a bounded abuse report. The application stores a keyed
reporter fingerprint for rate/duplicate handling, not the raw source IP. Reverse
proxies may have separate access-log retention, which operators must review.
Public reads still require an active tenant and resolve every album/photo under
that tenant ID.

Disabling the link clears its identifier and makes the old URL return the same
generic not-found response as an invalid or suspended gallery. Enabling later
creates a different identifier. The write runs under the tenant lock and
rechecks owner membership, so revocation or suspension wins over a stale admin
screen. Public sharing is supported in both tenancy modes.

Public JSON is served `no-store` and the browser view requests `noindex`, but
those are cooperative controls, not access control. A media URL already issued
to a viewer can remain valid or cached through `MEDIA_URL_TTL_SECONDS` (one hour
by default). Review that TTL and any CDN cache policy against the required
revocation window.

## Bootstrap a tenant owner

The tenant migration intentionally creates no membership from environment
variables. From a source checkout with `DATABASE_URL` configured, claim the
default tenant explicitly:

```bash
pnpm tenant:bootstrap --slug default --owner-tg-id YOUR_NUMERIC_TELEGRAM_ID
```

For the production self-host container, run the already-built command:

```bash
docker compose exec app node dist/src/tenant-bootstrap \
  --slug default \
  --owner-tg-id YOUR_NUMERIC_TELEGRAM_ID
```

The command is idempotent for the same owner. It refuses to replace a different
existing owner. Tenant and membership rows never contain the Telegram bot token.

## Transition an existing installation to multi mode

Rehearse these steps on a disposable restore before production.

1. Back up PostgreSQL, media, and `.env` using
   [the self-host backup procedure](self-hosting.md#backups). Record the running
   Git revision and image tag.
2. Leave `TENANCY_MODE=single`. Build the new image and apply the committed
   migrations once. Do not enable multi mode in the same rollout step.
3. Confirm readiness, both Mini App mounts, and the existing album/photo count.
   Verify the database backfill:

   ```bash
   docker compose exec -T db psql -U gallery -d gallery -c '
     SELECT "slug", "status" FROM "Tenant";
     SELECT COUNT(*) AS albums_without_tenant FROM "Album" WHERE "tenantId" IS NULL;
     SELECT COUNT(*) AS photos_without_tenant FROM "Photo" WHERE "tenantId" IS NULL;
     SELECT COUNT(*) AS intents_without_tenant FROM "UploadIntent" WHERE "tenantId" IS NULL;
   '
   ```

   Expect tenant `default` with status `ACTIVE` and three zero counts.

4. While still in single mode, run the owner bootstrap command above twice. The
   first run should report `claimed` (or `created` on a new database); the second
   must report `unchanged`. A different owner ID must be refused.
5. Smoke single mode: an ID in `ADMIN_TG_IDS` can still list, create, upload,
   confirm, reorder, and delete without relying on the membership.
6. On staging, set `TENANCY_MODE=multi`, restart only the app, and sign in as the
   bootstrapped owner. Confirm the default gallery appears in admin, its home
   link uses `tenant_default`, and existing `album_<id>` shares still open.
7. Create two staging tenants with different owners. Verify their album lists,
   uploads, media URLs, reorder, reconciliation, and delete operations never cross;
   verify a valid viewer can read either active gallery but cannot mutate one.
8. Add one collaborator to only the first tenant. Verify content mutations work
   there, its Style selection reaches only that gallery, billing/team access
   fails, and revocation immediately blocks writes.
9. Enable a public browser link for only the first tenant. Verify its albums and
   report path work without Telegram auth, cross-tenant album IDs remain hidden,
   the collaborator cannot change the link, and disable invalidates it.
10. Configure a staging tenant-bot encryption key and connect a disposable bot
    to the first tenant. Verify its generated links, cross-tenant rejection,
    token rotation, disconnect, and shared-bot recovery. Do not set a tenant
    bot webhook.
11. Repeat the backup, migration, bootstrap, single-mode smoke, and multi-mode
    enablement in production as separate observable steps.

The repository E2E gate rehearses the migrations against empty and populated
legacy schemas and runs a two-tenant owner/collaborator isolation matrix. Run it
before rollout:

```bash
pnpm check
pnpm build
```

## Rollback limitations

- Switching the environment back to `single` is non-destructive, but it exposes
  only `tenant_default`. It does not merge albums or media created in other
  tenants.
- Once multi mode contains tenant-owned data, do not run a pre-tenant image.
  Its writes do not provide required tenant IDs. Restore the matching
  pre-migration database and media backup if an old image is required.
- Never rewrite tenant IDs or object prefixes as a rollback shortcut. Preserve
  the database and investigate with the app stopped if isolation is in doubt.
