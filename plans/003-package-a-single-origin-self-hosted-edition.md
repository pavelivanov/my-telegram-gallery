# Plan 003: Package a single-origin, one-image self-hosted edition

> **Executor instructions**: Execute in order and run every verification gate.
> This plan changes production topology but must retain local frontend
> development. Do not deploy or publish a template as part of this plan. Update
> `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 9282d53..HEAD -- apps/api apps/admin apps/gallery Dockerfile docker-compose.yml docker scripts README.md package.json railway.json`
> The frontends were dirty when planned, including new build-time share-link
> variables. Preserve unrelated UI work and replace only the configuration
> mechanism described here.

## Status

- **Priority**: P0
- **Effort**: L (4–5 days)
- **Risk**: MED
- **Depends on**: `plans/002-add-storage-drivers-and-safe-media-flows.md`
- **Category**: architecture, DX, docs
- **Planned at**: commit `9282d53`, 2026-07-13; dirty working tree
- **Execution status**: DONE (2026-07-13)

## Why this matters

Self-hosting is currently three Railway services, three build roots, two CORS
surfaces, and build-time frontend URLs. A prebuilt image cannot be retargeted
without rebuilding. Serving both Vite builds from the Nest process at one
origin gives self-hosters one app container and one public domain, removes API
CORS in production, and also simplifies the future SaaS topology.

The target is one immutable image with gallery at `/`, admin at `/admin`, API at
`/api`, PostgreSQL, and either a local media volume or S3. A Caddy compose
service handles public TLS for the documented quickstart.

## Current state

- `apps/admin/src/api/client.ts:3-6` and
  `apps/gallery/src/api/client.ts:3-6` default to
  `http://localhost:3000`; `VITE_API_BASE_URL` is embedded by Vite.
- Uncommitted code at `apps/admin/src/pages/AlbumPage/AlbumPage.tsx:130-132`
  and `apps/gallery/src/pages/AlbumPage/AlbumPage.tsx:32-34` embeds
  `VITE_GALLERY_TMA_LINK`, which has the same prebuilt-image problem.
- Both Vite configs use `base: '/'`; admin must build under `/admin/`.
- `apps/api/src/main.ts:7-10` puts API controllers under `/api` and enables CORS
  for split origins.
- `apps/*/railway.json` and `scripts/railway-deploy.sh:213-420` implement a
  three-service deployment.
- `README.md:114-151` documents three Railway services and storage CORS.
- No root Dockerfile, Compose production stack, Docker ignore, or root Railway
  service config exists.
- The current `/api/health` only proves the process can answer; it does not
  distinguish liveness from database/storage readiness.

Repository conventions:

- Frontend routing uses `HashRouter`, so each built app needs an index fallback
  at its mount path but not server-side route enumeration.
- The API production command is `node dist/src/main`.
- Prisma client is generated into `apps/api/generated/prisma` and migrations
  live under `apps/api/prisma/migrations`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Full gate | `pnpm check && pnpm build` | exit 0 |
| Image build | `docker build -t my-telegram-gallery:local .` | exit 0 |
| Compose validation | `docker compose config --quiet` | exit 0 |
| Container smoke | `bash scripts/smoke-self-host.sh` | migration, health, static routes pass; stack removed |

## Scope

**In scope**:

- `apps/api/package.json`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`
- `apps/api/src/config/*`
- `apps/api/src/health/*` (create)
- `apps/api/src/public-config/*` (create)
- `apps/admin/src/api/client.ts`, `apps/gallery/src/api/client.ts`
- frontend share-link construction and public config types/hooks
- `apps/admin/vite.config.ts`, `apps/gallery/vite.config.ts`
- frontend `.env.example` files
- `package.json`, `pnpm-lock.yaml`
- root `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, `docker/Caddyfile`
- root `docker-compose.yml`, `.env.selfhost.example`
- `scripts/init-self-host.sh`, `scripts/smoke-self-host.sh`
- root `railway.json`
- existing `apps/*/railway.json` and Railway helper scripts only to retire or
  clearly mark the old topology
- `README.md`, `docs/self-hosting.md`, `docs/upgrading.md` (create as needed)
- CI workflow only to add image build/smoke checks

**Out of scope**:

- Tenant models/onboarding (Plan 004).
- SaaS quotas, billing, moderation, or public launch.
- Publishing an image or Railway template (Plan 007).
- Automatic DNS registration or BotFather automation; BotFather remains a
  documented manual step.
- Running any Railway deploy command.

## Git workflow

- Branch: `codex/003-single-origin-self-host`
- Commit frontend/static serving, container packaging, then docs/smoke tests as
  separate logical commits.
- Do not push or deploy.

## Steps

### Step 1: Make API and share configuration runtime-safe

1. Keep optional `VITE_API_BASE_URL` only as a development/legacy override, but
   make the production default the empty same-origin base. Both clients must
   request `/api/...` when it is unset.
2. Configure each Vite dev server to proxy `/api` to `http://localhost:3000` so
   ordinary development no longer needs a frontend env file.
3. Remove `VITE_GALLERY_TMA_LINK` as a production requirement. Add a safe public
   config endpoint returning only non-secret values such as:
   - bot username;
   - admin and gallery Mini App short names;
   - tenancy mode and non-sensitive upload limit if useful.
4. Validate `TELEGRAM_BOT_USERNAME`, `TELEGRAM_ADMIN_APP_SHORT_NAME`, and
   `TELEGRAM_GALLERY_APP_SHORT_NAME` at API startup. Build canonical t.me links
   in one frontend helper from public config. Preserve the current
   `album_<id>` link format until Plan 004 adds tenant links.
5. Never return bot tokens, storage settings, admin IDs, or signing secrets from
   public config.

**Verify**: build both frontends with no `VITE_*` variables, inspect generated
assets with
`rg 'localhost:3000|VITE_GALLERY_TMA_LINK' apps/*/dist` -> no matches.

### Step 2: Serve both Vite apps from Nest

1. Add `@nestjs/serve-static` using the version compatible with Nest 11.
2. Build admin with `base: '/admin/'` and gallery with `base: '/'`.
3. Configure two static roots from a validated `STATIC_ROOT`:
   - gallery root at `/`;
   - admin root at `/admin`;
   - exclude `/api` from both and prevent the gallery fallback from consuming
     `/admin`.
4. Return the right index for `/` and `/admin/`. Because both use HashRouter,
   verify `/admin/#/albums/...` asset resolution rather than converting routers.
5. In production same-origin mode, disable CORS unless an explicit
   `WEB_ORIGINS` allowlist is configured. Never default production CORS to
   `true`; keep a clear dev path.
6. Add security headers appropriate for static/API responses, including
   `X-Content-Type-Options: nosniff`; do not introduce a CSP until the exact
   Telegram SDK/image origins are tested.

**Verify**: after `pnpm build`, start the API with `STATIC_ROOT` pointing at the
two dist directories. `curl -fsS http://127.0.0.1:3000/`,
`curl -fsS http://127.0.0.1:3000/admin/`, and
`curl -fsS http://127.0.0.1:3000/api/health/live` all succeed; an unknown API
route returns JSON 404 rather than a SPA index.

### Step 3: Add liveness and readiness

Replace the single shallow health response with:

- `GET /api/health/live`: process is running; no external calls.
- `GET /api/health/ready`: bounded database query plus storage readiness check
  appropriate to the driver (filesystem directory writable/readable, or a
  lightweight S3 bucket operation). Return non-2xx when a dependency is down.

Do not expose connection strings, bucket names, filesystem paths, or stack
traces in the response.

**Verify**: E2E covers ready success and mocked database/storage failure;
`pnpm test:e2e` passes.

### Step 4: Build one production image

Create a root multi-stage Dockerfile using Node 22 on a Debian slim family
image (avoid Alpine surprises for Sharp/Prisma). It must:

1. Use Corepack and the locked pnpm version.
2. Install from `pnpm-lock.yaml` with a frozen lockfile.
3. Generate Prisma client, build admin, gallery, and API.
4. Copy the two dist trees into a stable `STATIC_ROOT` in the runtime image.
5. Include API runtime dependencies, generated client, Prisma schema/migrations,
   and a Prisma CLI capable of `migrate deploy` in the final image. If Prisma
   remains a dev dependency, explicitly create a migration stage/tool path;
   do not assume it exists after a production-only deploy.
6. Run as a non-root user, use an init process, expose 3000, and write only to
   the configured media volume/temp directories.
7. Add `RUN_MIGRATIONS_ON_START=true|false`. The self-host default may run
   `prisma migrate deploy` before boot; Railway/SaaS must be able to disable it
   and use a single pre-deploy migration command to avoid replica races.

Pin base images by supported major/minor or digest according to project release
policy. Add a small `.dockerignore` excluding env files, node_modules, builds,
Git metadata, and local tool state.

**Verify**: `docker build -t my-telegram-gallery:local .` -> exit 0; run
`docker inspect` and confirm the configured user is non-root.

### Step 5: Add the 15-minute Compose path

Create a production-oriented `docker-compose.yml` with:

- `app`: the single image, private port 3000, readiness health check, media
  volume, filesystem+proxy defaults, and dependency on healthy Postgres.
- `db`: PostgreSQL 17, named data volume, health check, no public port by
  default.
- `caddy`: ports 80/443, Caddy data/config volumes, reverse proxy to app, and a
  `${DOMAIN}` site address for automatic TLS.

Add `.env.selfhost.example` and `scripts/init-self-host.sh`. The script should
copy the example without overwriting an existing file and generate strong
`POSTGRES_PASSWORD` and `MEDIA_URL_SIGNING_SECRET`; it must never print secret
values after writing them. Human-supplied minimums are then:

- `DOMAIN`
- `TELEGRAM_BOT_TOKEN`
- `ADMIN_TG_IDS`
- bot username and the two Mini App short names

Do not claim “three variables” when share links and TLS require more identity
information. Document DNS A/AAAA records and inbound 80/443 prerequisites.

**Verify**: `docker compose config --quiet`; then
`bash scripts/smoke-self-host.sh` builds/starts a disposable stack, waits for
readiness, checks `/`, `/admin/`, and `/api/health/live`, confirms migrations,
and always tears down with volumes.

### Step 6: Replace deployment documentation and preserve an escape hatch

Write `docs/self-hosting.md` as a real quickstart:

1. prerequisites and DNS;
2. BotFather: one bot, two Mini Apps, URLs `https://DOMAIN/` and
   `https://DOMAIN/admin/`;
3. init script and env edit;
4. `docker compose up -d`;
5. health/log verification;
6. backup, update, and rollback pointers;
7. S3/direct-mode optional configuration and its bucket-CORS requirement.

Update README architecture and remove the three-service path as the primary
deployment. Either adapt Railway helpers/config to one `app` service or place
the legacy scripts under an explicitly deprecated section with a removal date;
do not leave two “recommended” topologies.

Create a root `railway.json` using the Dockerfile, a pre-deploy migration
command, the readiness health path, and one app service. Do not deploy it.

**Verify**: every command copied from the quickstart is exercised by the smoke
script or `docker compose config`; `rg 'services: `admin`|api,admin,gallery'
README.md docs` finds no active recommended topology.

### Step 7: Extend CI with container verification

After the existing source gate, add Docker build and a bounded container smoke
job. Cache layers if straightforward, but correctness is the requirement.

**Verify**: local `pnpm check && pnpm build && docker build ...` succeeds; the
first PR shows green source and image jobs.

## Test plan

- E2E static routing: `/`, `/admin/`, `/api/health/live`, unknown `/api/*`.
- Public config test proving only allowlisted fields are returned.
- Ready endpoint success and dependency failures.
- Docker smoke with filesystem proxy media after Plan 002.
- Frontend production build with no `VITE_API_BASE_URL` or share-link env.
- Manual Telegram test is required before release: both BotFather paths open,
  admin can upload, gallery can view, and an album link opens correctly.

## Done criteria

- [x] `pnpm check && pnpm build` exits 0.
- [x] `docker build` and `docker compose config --quiet` exit 0.
- [x] Smoke script proves one app container serves both SPAs and API.
- [x] Production assets contain no localhost or required build-time service URL.
- [x] Proxy default requires no S3 bucket or bucket CORS.
- [x] Runtime container is non-root and includes migration capability.
- [x] Liveness and readiness are distinct and tested.
- [x] Quickstart has one recommended topology and complete BotFather/TLS steps.
- [x] No Railway deploy was performed.
- [x] Only in-scope files plus `plans/README.md` changed.

## STOP conditions

Stop and report if:

- Serving gallery `/` consumes `/api` or `/admin` routes.
- The final image cannot run `prisma migrate deploy` reproducibly.
- Sharp or Prisma requires moving to an unsupported/privileged runtime image.
- The compose quickstart needs a public database or storage port.
- A build-time secret is proposed for either frontend.
- Existing dirty frontend work would be overwritten.

## Maintenance notes

- Prefer the one-origin topology for SaaS too; split static services can be
  reintroduced behind a CDN later only when measurements justify it.
- Railway templates sourced from GitHub can receive upstream update PRs; Plan
  007 should publish source-based topology, not an opaque image-only template.
- Multi-replica SaaS must set `RUN_MIGRATIONS_ON_START=false` and perform one
  pre-deploy migration.
- BotFather remains an unavoidable manual setup step for self-hosters; keep its
  screenshots and UI wording current.
