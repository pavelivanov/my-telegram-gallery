# Tenancy modes and transition runbook

The same image supports a self-hosted single gallery and a hosted multi-gallery
service. `TENANCY_MODE=single` is the default. Both modes use one Telegram bot;
per-tenant bot tokens, ownership transfer, and white-label bots are not
supported.

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
   there, billing/team access fails, and revocation immediately blocks writes.
9. Repeat the backup, migration, bootstrap, single-mode smoke, and multi-mode
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
