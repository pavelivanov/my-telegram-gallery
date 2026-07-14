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
- The gallery bundle now distinguishes a verified Telegram Mini App environment
  from an ordinary browser. Browser visitors receive a responsive, data-free
  product landing page with runtime-derived Telegram and optional legal links;
  Telegram initialization failures retain a separate compatibility state.
  Desktop and 390-by-844 mobile browser rehearsals passed with no horizontal
  overflow. The page uses only project code/CSS and introduces no marketing
  asset-ownership claim. Public copy and configured legal destinations still
  require owner review before launch.
- Optional server-side Sentry capture is wired through the existing global
  exception boundary. It is disabled without a DSN, defaults to error-only
  capture, strips request/identity data, and reuses configured-secret redaction.
  No external project was contacted during local verification; staging delivery,
  retention, and scrubbed-event inspection remain operator acceptance gates.
- Multi-mode owners can now delegate content administration to bounded numeric
  Telegram identities and revoke it without transferring billing, team, or
  ownership authority. The populated migration rehearsal and isolation E2E
  cover role preservation, cross-tenant denial, owner-only controls, and
  immediate revocation. Product copy and a production-shaped Telegram client
  acceptance pass remain external gates.
- Gallery presentation is now tenant-scoped through three server-defined visual
  presets. Existing tenants retain Nocturne, owner/admin writes are rechecked
  under the tenant lock, suspended tenants are immutable, and album deep links
  resolve presentation without exposing arbitrary CSS or assets. Migration,
  isolation, component, and local browser checks are repository gates; final
  Telegram client contrast review remains an operator acceptance item.
- Public browser galleries are now private by default and require an owner to
  create a random opaque link. Revocation clears the identifier, suspension
  hides content, collaborators cannot publish, cross-tenant IDs remain hidden,
  and browser reports retain only a keyed fingerprint rather than a raw IP.
  Migration/isolation/component checks are automated; policy review, proxy-log
  retention review, and staging abuse-response acceptance remain external.
- Multi-mode owners can connect a white-label Telegram bot after a non-mutating
  `getMe` verification. Tokens use tenant-bound AES-256-GCM encryption, never
  appear in API responses, and rotate/revoke without an auth cache. Custom-bot
  init data is cryptographically confined to its tenant, including tenant-list
  and selector routes. BotFather client acceptance, encryption-key custody, and
  recovery drills remain external; tenant webhooks and billing are not active.
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
