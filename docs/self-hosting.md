# Self-hosting

This is the supported production topology: one immutable application image
serves the gallery at `/`, the administrator Mini App at `/admin/`, and the API
at `/api/`. PostgreSQL and Caddy run beside it in Docker Compose. Filesystem
media is stored in a named volume by default. Opening `/` in an ordinary browser
shows a public landing page whose Telegram CTA is built from runtime bot/app
configuration; gallery records are still available only inside Telegram.

## Prerequisites

- A Linux server with Docker Engine and the Docker Compose plugin.
- A public IPv4 and/or IPv6 address. Create DNS `A` and/or `AAAA` records for
  the gallery hostname before starting.
- Inbound TCP ports 80 and 443, plus UDP 443 if HTTP/3 is desired. Caddy uses
  ports 80 and 443 to obtain and renew TLS certificates.
- One Telegram bot and your numeric Telegram user ID.

Do not place another proxy on ports 80/443 unless you intentionally replace
Caddy and understand how certificates and forwarded headers will be handled.

## Configure BotFather

Create one bot with [@BotFather](https://t.me/BotFather), then create two Mini
Apps under that bot. Choose distinct short names and configure these URLs:

- gallery Mini App: `https://YOUR_DOMAIN/`
- admin Mini App: `https://YOUR_DOMAIN/admin/`

Keep the bot username without `@`, the two short names, and the bot token. Album
share links are constructed at runtime as
`https://t.me/BOT_USERNAME/GALLERY_SHORT_NAME?startapp=album_ID`; the image does
not need to be rebuilt when these values change.

## Initialize and start

From the repository root:

```bash
bash scripts/init-self-host.sh
```

The script creates a mode-600 `.env`, generates a database password and an
independent media URL signing secret, and never prints either value. It will not
overwrite an existing `.env`.

Edit `.env` and provide at least:

- `DOMAIN`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_ADMIN_APP_SHORT_NAME`
- `TELEGRAM_GALLERY_APP_SHORT_NAME`
- `ADMIN_TG_IDS` (comma-separated numeric Telegram user IDs)

Keep `TENANCY_MODE=single` for the normal self-hosted setup. In this mode the
configured administrator IDs manage the automatically created default gallery;
no membership row or role distinction is required. Multi-tenant hosting,
owner-managed collaborator administrators, and the safe transition procedure
are documented in [tenancy.md](tenancy.md).

Then validate and start the stack:

```bash
docker compose config --quiet
docker compose up -d
```

The first start builds the application image, applies committed Prisma
migrations once in the app container, and waits for PostgreSQL. Caddy obtains a
certificate after DNS and ports are correct.

## Verify and troubleshoot

```bash
curl -fsS https://YOUR_DOMAIN/api/health/live
curl -fsS https://YOUR_DOMAIN/api/health/ready
docker compose logs --tail=100 app caddy db
```

Liveness only proves the process can answer. Readiness returns non-2xx when the
database or configured storage driver is unavailable. Responses do not include
connection strings, bucket names, paths, or stack traces.

If TLS issuance fails, verify the DNS records resolve to this server and that
public inbound ports 80 and 443 reach Caddy. If the app is not ready, inspect
the app and database logs; startup validation reports missing variable names
without printing their values.

## Backups

Back up both PostgreSQL and media before every upgrade. For the default names:

```bash
mkdir -p backup
docker compose exec -T db pg_dump -U gallery -d gallery -Fc \
  > backup/gallery.dump
docker compose exec -T app tar -C /data/media -cf - . \
  > backup/media.tar
```

Also back up `.env` securely. It contains the bot token, database password, and
media signing key. Losing the media signing key invalidates current signed URLs
but not stored media; losing the bot token requires rotation through BotFather.

See [backups.md](backups.md) for the complete retention and restore-drill
procedure, and [upgrading.md](upgrading.md) for update and rollback.

## Optional error monitoring

Server-side Sentry reporting is available but disabled by default. Leave
`SENTRY_DSN` empty for a traffic-free installation. Operators who opt in should
configure environment/release labels, keep tracing at zero initially, and
complete the privacy and staging-delivery checks in
[operations.md](operations.md#optional-sentry-error-monitoring).

## Optional S3-compatible storage

Set `STORAGE_DRIVER=s3` and fill `S3_REGION`, `S3_BUCKET`, access credentials,
and optional `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE`. Choose one transfer mode:

- `STORAGE_TRANSFER_MODE=proxy`: browser uploads and image delivery stay on the
  application origin; bucket CORS is not required.
- `STORAGE_TRANSFER_MODE=direct`: the browser uses presigned object-store URLs.
  Configure bucket CORS to allow the public gallery origin and at least `PUT`,
  `GET`, and `HEAD` with the content headers required by uploads.

Restart the app after changing storage configuration and confirm readiness
before uploading. Moving existing objects between drivers is not automatic.

## Railway escape hatch

The root `railway.json` builds this same Dockerfile as one application service,
runs migrations in a pre-deploy command, and checks `/api/health/ready`. Add
PostgreSQL plus either a persistent `/data/media` volume or S3 configuration.
The former per-app `apps/*/railway.json` files and three-service helper scripts
were retired on 2026-07-13; do not create separate API, admin, and gallery
services.
