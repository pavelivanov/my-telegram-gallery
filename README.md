# my-telegram-gallery

A self-hostable Telegram gallery with two Mini Apps and one production image.
The public gallery lives at `/`, the administrator app at `/admin/`, and the
NestJS API at `/api/`.

## Production topology

| Component | Role |
| --- | --- |
| Application image | React gallery + React admin + NestJS API |
| PostgreSQL 17 | Albums, photos, and durable upload intents |
| Filesystem or S3 | Original images and generated variants |
| Caddy | Public HTTP/HTTPS and automatic certificates |

Both Mini Apps use the same Telegram bot. The API validates signed Telegram init
data for all protected routes and separately checks `ADMIN_TG_IDS` for writes.
Runtime public config contains only the bot username, the two Mini App short
names, tenancy mode, and upload limit—never tokens, administrator IDs, storage
credentials, paths, or signing secrets.

## Self-host in a few minutes

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

The complete DNS, BotFather, backup, S3, troubleshooting, and Railway guidance
is in [docs/self-hosting.md](docs/self-hosting.md). Read
[docs/upgrading.md](docs/upgrading.md) before updating a live installation.

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

Prerequisites are Node.js 22+, Corepack/pnpm 10, and PostgreSQL 17.

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

## API shape

Important public operational routes:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/config/public` | Non-secret BotFather identity and public limits |
| `GET /api/health/live` | Process liveness, without dependency calls |
| `GET /api/health/ready` | Bounded PostgreSQL and storage readiness |
| `GET /api/media/photos/:id/:variant` | Signed proxy media delivery |

Album and upload routes require `Authorization: tma <initDataRaw>`; mutations
also require an ID in `ADMIN_TG_IDS`. Uploads use a server-created intent,
then either a same-origin proxy PUT or presigned S3 PUT, followed by confirmation
with the intent ID. Clients never choose or receive raw storage keys.

## Verification

```bash
pnpm check
pnpm build
docker build -t my-telegram-gallery:local .
docker compose config --quiet
bash scripts/smoke-self-host.sh
```

The smoke test creates a disposable Compose project, validates generated
secrets, applies migrations, checks readiness/liveness and both static mounts,
then always removes containers and volumes.

## Deployment policy

The supported topology is one application service. Root `railway.json` is the
single-service Railway escape hatch and uses the same Dockerfile. The previous
three-service Railway configuration and helper entry points were retired on
2026-07-13 and deliberately exit with migration guidance.

This repository does not publish or deploy an image automatically.
