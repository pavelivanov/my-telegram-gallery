# Plan 001: Establish a trustworthy verification, configuration, and Telegram-auth baseline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9282d53..HEAD -- package.json apps/api apps/admin/eslint.config.js apps/gallery/eslint.config.js scripts/e2e-db-prepare.sh .github`
> The working tree was already dirty when this plan was written, especially in
> both frontends. Compare the current-state excerpts below with the live files.
> If an in-scope file has changed incompatibly, stop and report.

## Status

- **Priority**: P0
- **Effort**: M (2–3 days)
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests, security, DX
- **Planned at**: commit `9282d53`, 2026-07-13; dirty working tree

## Why this matters

Every later stage changes authentication, persistence, packaging, or tenant
boundaries. Today typechecking works, but both frontend lint commands are
broken, the root has no one-command verification gate, the API has one trivial
unit test, and Telegram init data has no freshness check. Establish the gate
first so later executors can detect regressions rather than guessing.

## Current state

- `package.json:5-13` has per-app build commands but no `typecheck`, `lint`,
  `test`, `test:e2e`, or `check` script.
- `apps/admin/eslint.config.js:12-15` and
  `apps/gallery/eslint.config.js:12-15` enable type-aware rules without
  configuring typed parser services. Both `pnpm --filter <app> lint` currently
  exit 2 while loading `@typescript-eslint/await-thenable`.
- `apps/api/package.json:11` makes `lint` mutate source with `--fix`; a CI lint
  command must be check-only.
- `apps/api/src/auth/tg-init-data.guard.ts:33-58` verifies the HMAC but does not
  validate `auth_date`, compares strings directly, and lets malformed `user`
  JSON escape as a server error.
- `apps/api/src/auth/admin.guard.ts:22-24` accepts exactly one `ADMIN_TG_ID`.
- `apps/api/src/main.ts:6-11` configures prefix, CORS, and validation inline,
  so the E2E app in `apps/api/test/app.e2e-spec.ts:10-23` does not exercise the
  production bootstrap shape.
- `apps/api/.env.example:1-19` documents required values but there is no
  conditional startup validation or clear combined error report.
- `scripts/e2e-db-prepare.sh` already resets a PostgreSQL database on port
  55432 and should remain the migration-based preparation path.

Known baseline on 2026-07-13:

| Command | Result |
|---|---|
| `pnpm --filter admin exec tsc --noEmit` | exit 0 |
| `pnpm --filter gallery exec tsc --noEmit` | exit 0 |
| `pnpm --filter api exec tsc --noEmit -p tsconfig.build.json` | exit 0 |
| `pnpm --filter api test --runInBand` | 1 suite / 1 test passes |
| frontend `lint` scripts | exit 2: typed lint config missing |
| check-only API ESLint | 2 formatting errors and 1 floating-promise warning |

Repository conventions to preserve:

- Nest providers use constructor injection, as in
  `apps/api/src/albums/albums.service.ts:9-14`.
- Boundary DTOs use `class-validator`, as in
  `apps/api/src/albums/albums.dto.ts`.
- TypeScript is strict in both frontends; do not weaken compiler settings.
- Keep `lint` check-only and add an explicit `lint:fix`; verification must never
  edit files.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Typecheck | `pnpm typecheck` | all three apps exit 0 |
| Unit tests | `pnpm test` | all API unit suites pass |
| E2E | `pnpm test:e2e` | PostgreSQL-backed API suites pass and containers stop |
| Lint | `pnpm lint` | exit 0 with zero warnings |
| Full gate | `pnpm check` | typecheck, lint, unit, and E2E all pass |
| Build | `pnpm build` | admin, gallery, and API build successfully |

## Scope

**In scope**:

- `package.json`
- `apps/api/package.json`
- `apps/api/src/main.ts`
- `apps/api/src/bootstrap.ts` (create)
- `apps/api/src/config/env.ts` and tests (create)
- `apps/api/src/auth/tg-init-data.guard.ts` and focused tests
- `apps/api/src/auth/admin.guard.ts` and focused tests
- `apps/api/src/auth/request-context.ts` (create if needed)
- `apps/api/src/app.module.ts`
- `apps/api/src/app.controller.spec.ts`
- `apps/api/test/app.e2e-spec.ts`
- `apps/api/test/helpers/telegram-init-data.ts` (create)
- `apps/api/.env.example`
- `apps/admin/eslint.config.js`
- `apps/gallery/eslint.config.js`
- `apps/admin/src/mockEnv.ts`
- `apps/gallery/src/mockEnv.ts`
- `compose.test.yml` (create)
- `scripts/test-e2e.sh` (create)
- `scripts/e2e-db-prepare.sh` only if needed to make the existing flow reliable
- `.github/workflows/ci.yml` (create)
- formatting-only corrections surfaced by the new check-only lint command

**Out of scope**:

- Storage abstraction or new storage environment variables (Plan 002).
- Static frontend serving, Docker production packaging, or Railway topology
  changes (Plan 003).
- Tenant tables, tenant guards, billing, quotas, or rate limits.
- Changing endpoint response shapes.
- Deploying anything.

## Git workflow

- Branch: `codex/001-verification-auth-baseline`
- Use one commit for the verification harness and one for auth/config hardening.
- Existing history uses short imperative subjects such as
  `Add /api/health endpoint`; match that style.
- Do not push or deploy unless the operator explicitly asks.

## Steps

### Step 1: Make every verification command check-only and runnable from root

1. Add root scripts:
   - `typecheck`: run the three known-good `tsc --noEmit` commands.
   - `lint`: call each package's check-only lint script.
   - `test`: `pnpm --filter api test --runInBand`.
   - `test:e2e`: `bash scripts/test-e2e.sh`.
   - `build`: build admin, gallery, then API.
   - `check`: typecheck, lint, unit tests, then E2E.
2. In `apps/api/package.json`, remove `--fix` from `lint` and add the old
   mutating behavior as `lint:fix`.
3. In both frontend ESLint configs, configure typed linting with
   `parserOptions.projectService: true` and
   `tsconfigRootDir: import.meta.dirname`, matching the API config's working
   pattern. Do not disable the failing rule.
4. Fix existing API formatting/floating-promise findings without behavior
   changes; call `void bootstrap()` or add a terminal rejection handler.
5. Remove duplicated package-level `pnpm.overrides` blocks if they still exist;
   the effective overrides already live at workspace root and pnpm currently
   warns that child overrides are ignored.

**Verify**: `pnpm typecheck && pnpm lint && pnpm test` -> exit 0, no warnings.

### Step 2: Make the E2E app match production bootstrap

1. Extract an exported `configureApp(app)` in `apps/api/src/bootstrap.ts` that
   applies the `api` prefix, global `ValidationPipe`, and CORS policy. Call it
   from `main.ts` and from E2E setup.
2. Add `compose.test.yml` with a disposable PostgreSQL 17 service bound to
   `127.0.0.1:55432`, a health check, and no persistent named volume.
3. Add `scripts/test-e2e.sh` with `set -euo pipefail` and a trap that always
   runs `docker compose -f compose.test.yml down -v`. It must start Postgres,
   call the existing migration reset script, set safe test-only environment
   values, and run Jest E2E serially.
4. Replace the scaffold E2E assertion with at least:
   - `GET /api/health` returns 200.
   - an API DTO rejects unknown/invalid fields via the real validation pipe.
   - a protected endpoint rejects a missing Telegram authorization header.
5. Do not contact real Telegram or object storage in tests. Override external
   providers or use syntactically valid dummy configuration.

**Verify**: `pnpm test:e2e` -> exit 0; `docker compose -f compose.test.yml ps -q`
prints nothing after the script exits.

### Step 3: Validate environment configuration once at startup

1. Create `apps/api/src/config/env.ts` with a synchronous validation function
   passed to `ConfigModule.forRoot({ isGlobal: true, validate })`.
2. Validate and normalize:
   - `DATABASE_URL` as a PostgreSQL URL.
   - non-empty `TELEGRAM_BOT_TOKEN`.
   - `ADMIN_TG_IDS` as a comma-separated set of decimal Telegram IDs, falling
     back to legacy `ADMIN_TG_ID`. Reject startup if neither yields an ID.
   - `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` as an integer, default 3600.
   - `WEB_ORIGINS` as an optional trimmed list; never interpret an empty string
     as wildcard credentials policy.
   - the current R2 variables as a complete set until Plan 002 replaces this
     part with driver-specific validation.
3. Return normalized values so guards and services do not each reparse strings.
4. Update `.env.example` with the new names, defaults, fallback/deprecation
   note, and no real credentials.
5. Add table-driven tests for missing, malformed, legacy, and normalized input.

**Verify**: `pnpm --filter api test -- env --runInBand` -> all env tests pass.

### Step 4: Harden Telegram init-data and admin authorization

1. Keep the official HMAC construction, but compare fixed-length hash buffers
   with `timingSafeEqual`; reject non-hex or wrong-length hashes first.
2. Require integer `auth_date`, reject timestamps older than the configured
   maximum age, and reject timestamps unreasonably in the future (allow a small,
   documented clock-skew window such as 30 seconds).
3. Catch malformed `user` JSON and validate at minimum a finite integer `id`;
   return 401, never 500.
4. Attach a typed request auth context containing the Telegram user and the
   signed `start_param`. Later plans will consume that value for navigation,
   but this plan must not treat it as authorization.
5. Parse `ADMIN_TG_IDS` once and authorize membership in the set. Keep
   `ADMIN_TG_ID` compatibility through the centralized config validator.
6. Add a test helper that creates fresh correctly signed init data from a
   test-only token; do not commit a real token or a copied production payload.
7. Update both frontend mock environments to use test/dev data compatible with
   freshness checks. Prefer a dev-only API helper or dynamically signed fixture;
   do not hardcode a long-lived real bot token into frontend code.

Focused tests must cover valid data, bad signature, stale/future/missing
`auth_date`, malformed user JSON, missing user, valid `start_param`, one legacy
admin, multiple admins, and a non-admin.

**Verify**: `pnpm --filter api test -- auth --runInBand` -> all auth tests pass.

### Step 5: Add CI using the same root commands

Create `.github/workflows/ci.yml` for pull requests and pushes to the default
branch. Use Node 22, the root package-manager declaration, pnpm caching, frozen
install, `pnpm check`, and `pnpm build`. Provide PostgreSQL 17 as a service for
E2E rather than nesting Docker Compose inside the hosted runner; make
`scripts/test-e2e.sh` support an already-running database through existing
`E2E_*` variables.

**Verify**: validate YAML locally if a linter is installed; then run
`pnpm check && pnpm build` -> exit 0. The first PR must show one green CI job.

## Test plan

- Extend Jest tests beside each guard/config module, using the signing helper in
  `apps/api/test/helpers/telegram-init-data.ts`.
- Use the real `configureApp` in E2E so prefix and validation cannot drift.
- The E2E database must be migration-built, not schema-pushed.
- CI and local verification must call the same scripts.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`,
      `pnpm check`, and `pnpm build` all exit 0.
- [ ] `rg '"lint":.*--fix' apps/*/package.json` returns no matches.
- [ ] Freshness and malformed-user regression tests exist and pass.
- [ ] `ADMIN_TG_IDS` supports multiple IDs and legacy `ADMIN_TG_ID` remains
      covered by tests.
- [ ] E2E uses the same prefix/pipes/CORS bootstrap as production.
- [ ] CI performs frozen install, full check, and build.
- [ ] No credentials or copied production init data were added.
- [ ] Only in-scope files plus `plans/README.md` changed.

## STOP conditions

Stop and report if:

- The current dirty frontend changes would be overwritten or need semantic
  changes beyond mock-environment compatibility.
- A real Telegram token or production init-data fixture appears necessary.
- The E2E suite requires a real R2/S3 connection; replace the provider instead.
- Supporting multiple admins changes public API shapes.
- Any verification step still fails after two focused attempts.

## Maintenance notes

- Plan 002 must replace temporary R2-specific env validation with conditional
  storage-driver validation.
- Plan 004 will keep `ADMIN_TG_IDS` only for single-tenant mode and use database
  membership in multi-tenant mode.
- Review clock-skew and max-age defaults when session requirements change.
- Do not let a future lint script regain `--fix`; CI checks must be read-only.
