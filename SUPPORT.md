# Support policy

## Self-hosted installations

After a public release, configuration questions and reproducible product bugs
may use the repository's issue templates. Community support is best-effort and
has no uptime, response-time, data-recovery, or upgrade SLA. Operators remain
responsible for their server, DNS/TLS, Telegram bot, database, object storage,
backups, monitoring, and platform charges.

Before requesting help, run the readiness endpoint and the relevant procedure
in [self-hosting.md](docs/self-hosting.md),
[upgrading.md](docs/upgrading.md), or
[operations.md](docs/operations.md). Share sanitized configuration names and
request IDs, never values or full logs containing user data.

## Security, abuse, and payments

- Vulnerabilities use the private process in [SECURITY.md](SECURITY.md).
- Content reports use the gallery report flow and the operator procedure in
  [abuse.md](docs/abuse.md).
- Telegram Stars disputes use the staffed `PAY_SUPPORT_CONTACT` shown by that
  deployment and `/paysupport`. Public issues must not include charge IDs,
  invoice payloads, Telegram init data, or customer details.

The hosted SaaS must not launch until security, abuse, payment support, backup,
and on-call ownership are named and tested. This repository does not currently
promise a paid-support tier.
