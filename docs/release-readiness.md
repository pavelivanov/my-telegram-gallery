# Release-readiness record

This is a sanitized engineering record, not legal/security sign-off. It may be
committed because it contains no credential values, private media, or customer
identifiers.

## Automated evidence — 2026-07-13

- Gitleaks `v8.30.1` scanned the complete history at candidate time. One exact
  historical fingerprint was reviewed: a public CircleCI status-badge token
  inherited from the original NestJS template README. `.gitleaksignore`
  suppresses only that commit/file/rule/line fingerprint. The full-history
  rescan reports no leaks, and every candidate reruns it through its own HEAD.
- Local ignored `apps/api/.env` and `apps/api/.env.production` files contain
  expected secret-shaped values. They are not tracked and are excluded by
  `.dockerignore`. Their values were not copied into this record. Operators
  must still rotate them if their handling or exposure is uncertain.
- `pnpm audit --prod` reports zero known advisories after narrow overrides for
  patched Hono, Hono Node Server, and Multer transitive versions.
- The runtime uses the multi-platform digest for Node `24.17.0` Active LTS on
  Alpine 3.23 and removes npm from the final image. The locally built
  `linux/arm64` candidate passed non-root, OCI-label, native Sharp, migration,
  readiness, liveness, and static-mount checks. This is not an amd64 test or a
  multi-architecture support claim.
- Syft `v1.46.0` recorded 329 library components in the local runtime image.
  Grype `v0.115.0` reported three medium findings and zero high/critical
  findings. Its high threshold passed. The saved image archive also produced
  zero Gitleaks findings with archive recursion enabled.
- Production dependency metadata reports MIT, Apache-2.0, ISC,
  BSD-2-Clause, BSD-3-Clause, 0BSD, Unlicense, and LGPL-3.0-or-later entries.
- Git history currently uses one author name/email identity. This does not prove
  copyright ownership or resolve employer/client claims.
- The three root screenshots visually contain synthetic gallery names and
  abstract gradients rather than private photographs. Ownership of the capture
  files still needs human confirmation.
- Upstream frontend MIT notices are byte-identical and remain in both app
  directories.

## Open human/external blockers

- Choose and review the root license and contributor-rights strategy.
- Confirm original-code and screenshot ownership, including employer/client
  rights.
- Confirm provenance/publication rights for retained template documentation
  images.
- Enable/test private vulnerability reporting and name security, support,
  backup, abuse, and payment owners.
- Select and verify registry, signing, provenance, and supported-architecture
  policy.
- Run clean-VM, disposable Railway, Telegram test-environment billing, restore,
  upgrade, rollback, and suspension drills.
- Obtain explicit approval before any public repository, artifact, template,
  deployment, DNS, bot, or production webhook action.
