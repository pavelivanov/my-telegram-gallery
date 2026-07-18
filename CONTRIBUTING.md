# Contributing

The project is licensed AGPL-3.0-only and may also be offered under separate
commercial licenses. External contributions are **not accepted** until a
professionally reviewed contributor license agreement (CLA) is adopted that
preserves the rights needed for commercial relicensing. Do not open or merge an
outside pull request in the meantime; maintainers will close it without using
the submitted code. See [the license decision](docs/decisions/001-license.md).

This file documents the engineering gate for current maintainers and future
contributors. The license grant for the source is in [LICENSE](LICENSE), not in
this contribution guide.

## Development setup

Use Node.js 24 LTS, Corepack/pnpm 10, Docker with Compose, and PostgreSQL 17. Follow
[the local-development instructions](README.md#local-development), then run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
bash scripts/smoke-self-host.sh
```

`pnpm check` includes local documentation links, TypeScript, lint, unit tests,
the populated migration rehearsal, PostgreSQL E2E tests, and bounded operations
reruns. Do not bypass a failing gate in a pull request.

## Database and tenant safety

- Add a new append-only Prisma migration; never edit a migration already used
  by another installation.
- Extend the populated migration fixture when a schema change can affect
  existing data.
- Scope every gallery row and object key through the authoritative tenant.
- Use the tenant lock for quota, entitlement, usage, or subscription mutations.
- Treat tenant headers and Telegram start parameters as selectors, not
  authorization.
- Never make client callbacks authoritative for plan/payment state.
- Preserve duplicate, concurrent, cross-tenant, suspended, downgrade, and
  rollback coverage for every affected path.

## Secrets and test data

Never commit `.env` files, Telegram init data, bot/webhook tokens, payment
identifiers, database URLs, storage credentials, private media, or production
logs. Use synthetic IDs and images in fixtures. Run the redacted full-history
scan described in [releasing.md](docs/releasing.md) before requesting release
review.

Security reports and payment disputes do not belong in public issues. Follow
[SECURITY.md](SECURITY.md) and [SUPPORT.md](SUPPORT.md).

## Pull-request checklist

This checklist applies to authorized maintainer work only until the reviewed
CLA is in place.

- Explain the user-visible outcome and migration/rollback impact.
- List the commands run and their results.
- Call out new environment variables and update examples/runbooks.
- Include browser evidence for changed UI states without private content.
- Confirm no production deploy, webhook, DNS, or public artifact action was
  performed unless separately approved.
- Update third-party notices when adding copied code, assets, or dependencies.
