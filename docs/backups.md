# Backup and restore runbook

A backup is complete only after PostgreSQL and media can be restored together.
The database owns object keys and tenant usage state; media without its matching
database snapshot (or vice versa) is not a usable gallery backup.

## Ownership and policy

The service operator owns PostgreSQL, media, and configuration backups. Use an
encrypted backup destination with access logging and a separate credential from
the running application. Recommended launch policy:

- daily PostgreSQL backup, retained 30 days;
- weekly media backup or continuous versioning, retained 30 days;
- monthly snapshot retained 12 months when policy/consent permits;
- quarterly restore drill into an isolated environment;
- backup before every migration or storage move.

Align retention with the published privacy/deletion policy. Restrict restore
access to operators, rotate backup credentials, and test that expired backups
are actually removed. Never commit `.env`, dumps, archives, or operator tokens.

## Compose backup

Create a consistent timestamped directory on encrypted storage:

```bash
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "backup/$stamp"
docker compose exec -T db pg_dump -U gallery -d gallery -Fc \
  > "backup/$stamp/gallery.dump"
docker compose cp app:/data/media "backup/$stamp/media"
cp .env "backup/$stamp/env"
chmod 600 "backup/$stamp/env"
sha256sum "backup/$stamp/gallery.dump" \
  > "backup/$stamp/SHA256SUMS"
```

Encrypt and transfer the directory immediately. A live filesystem copy can race
with an upload; for strict point-in-time recovery, briefly stop mutation traffic
or use a volume snapshot coordinated with the database timestamp. Record the
application Git revision/image digest and migration list beside the backup.

For S3, enable bucket versioning and server-side encryption, then use provider
replication or a credential-scoped sync into a separate backup account. Record
versioning/retention settings in the drill report; PostgreSQL backup remains
mandatory.

## Isolated restore drill

Never test a restore over production. Provision a disposable PostgreSQL
database and media volume/bucket with no public ingress, then:

1. Verify backup checksum and decrypt into the isolated operator workspace.
2. Restore PostgreSQL with `pg_restore --clean --if-exists` into the disposable
   database.
3. Restore media into the disposable volume/bucket.
4. Start the exact recorded image with the restored database/media and separate
   test bot credentials. Do not reuse the production bot token.
5. Confirm migrations, `/api/health/ready`, tenant counts, random original and
   variant media reads, and owner/gallery access.
6. Run usage reconciliation dry-run. Zero drift is required; missing objects or
   an incomplete scan fails the drill.
7. Record restore start/end time, recovery point, object/sample counts, failures,
   remediation owner, and next drill date.
8. Destroy the disposable environment and securely remove decrypted copies.

For a Compose-shaped disposable database, the core restore command is:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname "$RESTORE_DATABASE_URL" backup/TIMESTAMP/gallery.dump
```

## Production recovery

Declare the recovery point before writing. Stop the app, preserve the damaged
database/media for investigation, restore both sides from the selected matched
backup, then start one app replica without running unreviewed schema changes.
Require readiness, sample media, tenant isolation smoke, cleanup dry-run, and
zero-drift usage reconciliation before reopening traffic.

If only one media object is missing, do not restore counters or the whole bucket
blindly. Preserve its row, recover the exact object versions, and reconcile the
tenant. Any irreversible deletion follows [abuse.md](abuse.md) and the approved
retention policy.
