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
  Alpine 3.23 and removes npm from the final image. Locally built `linux/arm64`
  (native) and `linux/amd64` (emulated) images passed platform, non-root,
  OCI-label, Sharp, migration, readiness, liveness, and static-mount checks.
  Each saved image was removed, reloaded with the same image ID, and smoked by
  immutable ID. Independent native amd64 acceptance is still required before a
  multi-architecture support claim or registry manifest.
- Syft `v1.46.0` recorded 329 library components in each platform image. Grype
  `v0.115.0` reported three medium findings and zero high/critical findings in
  each; its high threshold passed. Both saved archives produced zero Gitleaks
  findings with archive recursion enabled, and all per-platform checksums
  verified after reload and smoke.
- Each candidate archive now receives an unsigned in-toto Statement v1 with a
  SLSA provenance v1 predicate. Local verification binds its archive digest,
  parameters, source revision, and build script to the checksummed evidence.
  Because the same local process emits the artifact and statement, this closes
  the traceability-format gap but does not satisfy trusted-builder, signing, or
  publisher-identity gates.
- Production dependency metadata reports MIT, Apache-2.0, ISC,
  BSD-2-Clause, BSD-3-Clause, 0BSD, Unlicense, and LGPL-3.0-or-later entries.
- Git history currently uses one author name/email identity. This does not prove
  copyright ownership or resolve employer/client claims.
- The three root screenshots visually contain synthetic gallery names and
  abstract gradients rather than private photographs. Ownership of the capture
  files still needs human confirmation.
- Upstream frontend MIT notices are byte-identical and remain in both app
  directories.

## Prepared controls awaiting external execution

- The private manual candidate workflow now has optional native amd64 and arm64
  jobs. They build, scan, archive, reload, and smoke independently on exact
  Ubuntu 24.04 runner labels, then retain each evidence set privately for seven
  days. It has no package-write, attestation, or identity-token permission.
- `pnpm release:verify -- EVIDENCE_DIRECTORY` independently checks transferred
  checksums, local provenance, scan reports, image identity/labels, secret
  guards, Sharp, and the Compose restart/backup/restore lifecycle smoke. It
  intentionally does not claim signing or publisher identity.
- The lifecycle smoke was rehearsed locally with synthetic tenant-scoped
  database/media state. Restart persistence, checksummed custom-format database
  plus media-tar backup, fresh-volume restore, restored-tree writeability, zero
  usage drift, zero billing discrepancies, and final restart all passed.
- A private `0.1.0-rc.local` candidate for implementation revision
  `d5716cb4e8cc82283a486b8c2b9adff5a75a73b6` passed the complete local candidate
  pipeline on `linux/arm64`. The independently invoked evidence verifier checked
  every transferred checksum, reloaded the exact image, and repeated the full
  lifecycle successfully. The candidate reported zero dependency advisories,
  zero full-history or image-archive secret findings, three medium image
  findings, and zero high/critical findings. This follow-up record changes only
  documentation; the eventual release revision and independent
  production-shaped drill still require their own evidence.
- Unused inherited template screenshots and nested GitHub Pages workflows were
  removed. The upstream MIT license files remain; there is no longer a template
  documentation-image publication blocker.

## Open human/external blockers

- Choose and review the root license and contributor-rights strategy.
- Confirm original-code and screenshot ownership, including employer/client
  rights.
- Enable/test private vulnerability reporting and name security, support,
  backup, abuse, and payment owners.
- Select and verify registry, signing, trusted provenance, and
  supported-architecture policy; execute the prepared native workflow and an
  independent reviewer-led acceptance run.
- Run clean-VM, disposable Railway, Telegram test-environment billing, restore,
  upgrade, rollback, and suspension drills.
- Obtain explicit approval before any public repository, artifact, template,
  deployment, DNS, bot, or production webhook action.
