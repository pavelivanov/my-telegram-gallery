> External pull requests are not accepted until a professionally reviewed CLA
> is adopted. This template is for authorized maintainer work only. Outside
> submissions will be closed without using the submitted code.

## Outcome

Describe the user-visible result and the reason for the change.

## Safety and compatibility

- [ ] Tenant selection is not treated as authorization; affected reads, writes,
      object keys, and media paths remain tenant-scoped.
- [ ] Database changes use a new append-only migration and document upgrade and
      rollback limits.
- [ ] Quota, entitlement, billing, report, and suspension mutations remain
      serialized and idempotent where applicable.
- [ ] New environment variables and runbooks are documented without values.
- [ ] No credential, Telegram init data, payment identifier, private media,
      customer data, or production log is included.
- [ ] No deploy, webhook, DNS, bot, tag, registry, template, or public-release
      action was performed unless separately approved.

## Verification

List exact commands and results. The normal gate is:

```bash
pnpm install --frozen-lockfile
pnpm audit:dependencies
pnpm check
pnpm build
bash scripts/smoke-self-host.sh
```

## Release notes

Call out migrations, backup requirements, storage effects, environment changes,
compatibility, third-party notices, and rollback constraints. Write “none” where
an item does not apply.
