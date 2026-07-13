# Upgrading and rollback

The application image contains the API, both frontend builds, the generated
Prisma client, and all committed migrations. Treat the image and database
schema as one release.

## Before an upgrade

1. Read the release notes and note any environment changes.
2. Back up the database, media volume, and `.env` as described in
   [self-hosting.md](self-hosting.md#backups).
3. Record the current source revision and tag the current local image:

```bash
git rev-parse HEAD
docker image tag my-telegram-gallery:local my-telegram-gallery:rollback
```

## Update

Check out the intended release or commit, then rebuild and restart:

```bash
git pull --ff-only
docker compose build --pull app
docker compose up -d --wait
curl -fsS https://YOUR_DOMAIN/api/health/ready
```

With the self-host default `RUN_MIGRATIONS_ON_START=true`, one app container
runs `prisma migrate deploy` before serving traffic. If you run multiple app
replicas, set it to `false` and execute one migration job before replacing the
replicas to avoid migration races.

## Roll back

First inspect `docker compose logs app`. A configuration or dependency outage
usually does not require a code rollback.

To run the previously tagged image, set
`APP_IMAGE=my-telegram-gallery:rollback` in `.env`, then run:

```bash
docker compose up -d --no-build --wait app caddy
curl -fsS https://YOUR_DOMAIN/api/health/ready
```

Prisma migrations are forward-only and are not reversed by an older image. If
the prior release cannot run against the upgraded schema, stop the stack and
restore the matching pre-upgrade database backup before starting the rollback
image. Restore the media backup too if the failed release changed stored
objects. Never delete named volumes merely to retry an upgrade.

The tenant migration has additional ordering and rollback constraints. Follow
[tenancy.md](tenancy.md#transition-an-existing-installation-to-multi-mode)
before changing `TENANCY_MODE` on an existing installation.
