# my-telegram-gallery

A self-hostable Telegram gallery with two Mini Apps and one production image.
The gallery and public browser landing page share `/`, the administrator app
lives at `/admin/`, and the NestJS API at `/api/`.

> **Pre-release:** no public release or support SLA exists yet. The source
> license, ownership, security contact, release signing, and clean-environment
> acceptance gates are still pending. Do not redistribute a release candidate.

Gallery content and administration remain Telegram-only: signed Telegram Mini
App init data is the authentication boundary. Ordinary browsers see a public
product landing page, never gallery data. Standalone browser accounts, public
non-Telegram galleries, collaborator roles, and bring-your-own bots are not
supported.

## Production topology

| Component | Role |
| --- | --- |
| Application image | React gallery + React admin + NestJS API |
| PostgreSQL 17 | Albums, photos, and durable upload intents |
| Filesystem or S3 | Original images and generated variants |
| Caddy | Public HTTP/HTTPS and automatic certificates |

Both Mini Apps use the same Telegram bot. The API validates signed Telegram init
data for all protected routes. In the default `single` mode it checks
`ADMIN_TG_IDS` for writes; in `multi` mode it checks database-backed tenant owner
memberships and scopes every album, photo, intent, object key, and media URL.
Runtime public config contains only the bot username, the two Mini App short
names, tenancy mode, upload limit, and optional public Terms/Privacy URLs—never
tokens, administrator IDs, storage credentials, paths, or signing secrets.

## Supported modes

| Area | Supported choice |
| --- | --- |
| Deployment | One application image plus PostgreSQL |
| Storage | Local filesystem volume or S3-compatible object storage |
| Transfers | Same-origin proxy; direct S3 transfer for reviewed hosted setups |
| Tenancy | `single` for self-hosting; `multi` for the not-yet-launched SaaS |
| Edge/TLS | Docker Compose with Caddy; source-built one-service Railway escape hatch |

## Self-host in about 15 minutes

You need Docker with Compose, a domain pointed at the server, inbound ports
80/443, one BotFather bot with two Mini Apps, and your numeric Telegram ID.

```bash
bash scripts/init-self-host.sh
# Edit .env with the domain, bot identity/token, Mini App short names, and admins.
docker compose config --quiet
docker compose up -d
curl -fsS https://YOUR_DOMAIN/api/health/ready
```

Configure the BotFather Mini App URLs as `https://YOUR_DOMAIN/` for the
gallery and `https://YOUR_DOMAIN/admin/` for the administrator app. The init
script generates strong database and media-signing secrets without printing or
overwriting them.

The complete 15-minute DNS, BotFather, backup, S3, and troubleshooting guide is
in [docs/self-hosting.md](docs/self-hosting.md). **Create and verify a backup
before every upgrade.** Read
[docs/upgrading.md](docs/upgrading.md) before updating a live installation.
See [docs/tenancy.md](docs/tenancy.md) before enabling multi mode.
Hosted operators should also read [docs/operations.md](docs/operations.md),
[docs/backups.md](docs/backups.md), [docs/abuse.md](docs/abuse.md), and the
[Telegram Stars billing runbook](docs/billing.md).

## Repository layout

```text
apps/
  admin/       administrator Mini App, built under /admin/
  gallery/     public gallery Mini App, built under /
  api/         NestJS API, Prisma schema/migrations, storage drivers
docker/        container entrypoint and Caddy configuration
docs/          self-hosting and upgrade runbooks
scripts/       verification, initialization, and disposable smoke checks
```

## Local development

Prerequisites are Node.js 24 LTS, Corepack/pnpm 10, and PostgreSQL 17.

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
```

Fill every required value in `apps/api/.env`. For local filesystem storage,
keep `STORAGE_DRIVER=filesystem`,
`STORAGE_TRANSFER_MODE=proxy`, and choose an absolute writable
`FILESYSTEM_STORAGE_PATH`. Create the schema and start the API:

```bash
pnpm prisma:migrate
pnpm dev:api
```

Each Vite development server proxies `/api` to
`http://localhost:3000`, so `VITE_API_BASE_URL` is normally unnecessary.
Run the apps in separate terminals:

```bash
pnpm dev:admin
pnpm --filter gallery dev -- --port 5174
```

The admin development URL includes `/admin/`. For Telegram testing, use the
corresponding `dev:https` scripts or a trusted HTTPS tunnel. An optional
`VITE_API_BASE_URL` remains available only for legacy split-origin
development; production builds default to same-origin requests.
Append `?landing` to the gallery development URL to preview the ordinary-browser
landing page without disabling the development Telegram mock globally.

## API shape

Important public operational routes:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/config/public` | Non-secret BotFather identity and public limits |
| `GET /api/health/live` | Process liveness, without dependency calls |
| `GET /api/health/ready` | Bounded PostgreSQL and storage readiness |
| `GET /api/media/tenants/:tenantId/photos/:id/:variant` | Tenant-bound signed proxy media delivery |
| `GET/POST /api/tenants` | Owned galleries and multi-mode onboarding |
| `POST /api/reports` | Rate-limited gallery abuse report intake |
| `GET/POST /api/billing/*` | Owner plan, checkout, and renewal controls |
| `POST /api/telegram/webhook` | Secret-authenticated Telegram payment updates |

Album and upload routes require `Authorization: tma <initDataRaw>`; mutations
require an env administrator in single mode or the selected tenant's owner in
multi mode. Uploads use a server-created intent,
then either a same-origin proxy PUT or presigned S3 PUT, followed by confirmation
with the intent ID. Clients never choose or receive raw storage keys.

Quota admission reserves bytes before upload and commits authoritative original
plus variant sizes at confirmation under a PostgreSQL tenant lock. Bounded
cleanup/reconciliation and audited operator commands are documented in
[docs/operations.md](docs/operations.md).

## Verification

```bash
pnpm install --frozen-lockfile
pnpm audit:dependencies
pnpm check
pnpm build
docker build -t my-telegram-gallery:local .
docker compose config --quiet
bash scripts/smoke-self-host.sh
LIFECYCLE_BUILD=false LIFECYCLE_IMAGE=my-telegram-gallery:local \
  pnpm smoke:lifecycle
```

The smoke tests create disposable Compose projects, validate generated secrets,
apply migrations, check readiness/liveness and both static mounts, then always
remove containers and volumes. The lifecycle variant also proves restart
persistence and a checksummed database/media restore into fresh volumes.

Maintainers can create a private, checksummed image archive, license inventory,
SBOM, and vulnerability report by following
[the release-candidate procedure](docs/releasing.md). Release evidence and open
human gates are tracked in [docs/release-readiness.md](docs/release-readiness.md).
Downloaded private evidence can be rechecked and smoke-tested with
`pnpm release:verify -- EVIDENCE_DIRECTORY`; this does not publish the image.

## Deployment policy

The supported topology is one application service. Root `railway.json` is the
single-service Railway escape hatch and uses the same Dockerfile. The previous
three-service Railway configuration and helper entry points were retired on
2026-07-13 and deliberately exit with migration guidance.

The proposed one-app template and credential-reference mapping are documented
in [docs/railway.md](docs/railway.md). This repository does not publish or
deploy an image automatically.

## Project policies

The project is not ready for external contributions or redistribution. Review
the pending [license decision](docs/decisions/001-license.md),
[third-party inventory](THIRD_PARTY_NOTICES.md),
[contribution rules](CONTRIBUTING.md), [community standards](CODE_OF_CONDUCT.md),
[security policy](SECURITY.md), and [support policy](SUPPORT.md). Public source,
container, Railway template, hosted SaaS, terms, privacy, and acceptable-use
publication remain separate approval gates.
