# Plan 007: License, publish, and launch the self-host and SaaS distributions

> **Executor instructions**: This plan contains human legal, security, and
> external-publication gates. Prepare artifacts and checks, but do not make the
> repository public, publish a container/template, or deploy production without
> explicit operator approval at the named step. Update `plans/README.md` when
> the approved work is complete.
>
> **Drift check (run first)**:
> `git diff --stat 9282d53..HEAD -- README.md CLAUDE.md LICENSE NOTICE THIRD_PARTY_NOTICES.md package.json apps/*/package.json apps/*/LICENSE docs .github Dockerfile docker-compose.yml railway.json scripts`
> All preceding plans should be complete. Stop if verification, image, runbook,
> or legal inputs are missing.

## Status

- **Priority**: P1
- **Effort**: L (4–7 days engineering/release work, excluding legal review)
- **Risk**: HIGH
- **Depends on**: self-host release needs Plan 003; SaaS release needs Plan 006
- **Category**: docs, direction, release
- **Planned at**: commit `9282d53`, 2026-07-13; dirty working tree

## Why this matters

Code is not a usable self-hosted product until its license, upgrade path,
artifacts, security posture, and support expectations are explicit. The
attached proposal's “AGPL-3.0 + hosted exception” wording is not a ready license
strategy: AGPL requires source offers for modified network use but does not ban
competing hosting, while an extra restriction against hosting would generally
make the result source-available rather than open source.

Choose the business objective first, get legal review, preserve the existing
Telegram template MIT notices, scan history before publicity, and only then
publish reproducible artifacts and a Railway template.

## Current state

- Root `package.json` is private and has no license field.
- `apps/api/package.json:7` says `UNLICENSED`.
- `apps/admin/LICENSE` and `apps/gallery/LICENSE` contain the upstream Telegram
  Mini Apps template MIT license and copyright notice; these notices must not be
  discarded by a root-license change.
- Contributor, conduct, security, support, third-party notice, release,
  upgrading, backup, billing, and operations artifacts now exist. The root
  license/notice and accepted contributor strategy remain blocked on the
  recorded owner/counsel decision.
- The repository remote is `pavelivanov/my-telegram-gallery`; the attached plan
  says it is private. Do not assume visibility without checking at release time.
- The one-image topology, Compose self-host path, private candidate workflow,
  SBOM/evidence scripts, Stars billing implementation, private-beta admission
  allowlist, cross-process scheduled-maintenance runner, and launch runbooks are
  implemented. The candidate is unsigned and unpublished; final
  native/clean-machine acceptance is still required.
- `railway.json` and a one-service template runbook are prepared, but no Railway
  project or marketplace template has been created or authorized.
- Railway's current public program (checked 2026-07-13) advertises a 15% base
  template usage kickback plus a 10% active-support bonus, not 50%. Treat this
  as a changeable distribution incentive, not a business-model guarantee.
- Railway source-based templates can surface upstream repository updates;
  image-only templates currently do not have the same update mechanism.

## License decision gate

The copyright owner must choose one with counsel before Step 2:

1. **AGPL-3.0-only community + separate commercial license** (recommended if
   copyleft and dual licensing fit the business). Rehosters may operate the app
   but modified network versions must offer corresponding source under AGPL.
   To preserve commercial relicensing ability, define contributor copyright/
   CLA policy before accepting external contributions.
2. **Apache-2.0 or MIT** (recommended if adoption/ecosystem simplicity is more
   important than hosted copyleft). This does not protect the hosted service
   from competitors.
3. **A counsel-drafted source-available license with hosting restrictions** if
   preventing competing SaaS is the requirement. Do not market this as “open
   source” unless the selected license is OSI-approved and actually meets that
   definition.

Do not invent a “hosted exception” in repository text. An additional permission
usually grants rights; a restriction changes the license category. Record the
decision in `docs/decisions/001-license.md`, including contributor implications.

## Commands you will need

| Purpose          | Command                                                     | Expected on success                         |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Full source gate | `pnpm check && pnpm build`                                  | exit 0                                      |
| Image gate       | `docker build -t my-telegram-gallery:release-candidate .`   | exit 0                                      |
| Compose smoke    | `bash scripts/smoke-self-host.sh`                           | exit 0 and clean teardown                   |
| Secret scan      | approved scanner over current tree **and full Git history** | zero unresolved findings                    |
| Dependency audit | ecosystem audit plus image scan                             | no unresolved reachable high/critical issue |
| Docs links       | approved Markdown/link checker                              | exit 0                                      |

## Scope

**In scope**:

- root `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`
- package license metadata and preservation of upstream app license files
- `docs/decisions/001-license.md`
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, support policy
- README/product architecture, self-host/SaaS links, screenshots/demo media
- Terms, Privacy, Acceptable Use, billing/support copy after professional review
- release/version/upgrade/backup docs
- GitHub CI/release/security workflows and dependency update config
- container image metadata, SBOM/provenance/signing configuration
- root Railway template/config metadata and template documentation
- release and launch checklists/scripts that do not contain secrets

**Out of scope**:

- Writing legal terms without counsel/owner approval.
- Making repository public, publishing artifacts/templates, deploying production,
  or changing DNS/bot configuration without explicit approval.
- Marketing claims about revenue, security certification, uptime, privacy, or
  open-source status that have not been substantiated.
- New product features such as BYO bot, public web galleries, themes, or
  collaborators.

## Git workflow

- Branch: `codex/007-release-distribution`
- Keep legal/notice, release automation, and launch copy in reviewable commits.
- Use tagged releases only after all human gates pass.

## Steps

### Step 1: Complete ownership and history due diligence

1. Inventory copied/derived code, fonts, images, icons, screenshots, and npm
   dependencies. Preserve the Telegram template MIT notices and list third-party
   assets requiring attribution.
2. Confirm who owns all original commits and whether any employer/client rights
   apply.
3. Run an approved secret scanner over the working tree and full Git history.
   If any real credential is found, reference only type/location in the private
   remediation record, rotate/revoke it, and decide whether history rewrite is
   required before public release. Never paste secret values into issues/plans.
4. Run dependency/license and container vulnerability scans; triage reachable
   high/critical findings.
5. Verify no `.env`, production init data, private media, Railway token, bot
   token, database URL, or signing secret is tracked in any release artifact.

**Verify**: signed-off checklist has zero unresolved credential, ownership,
license, high/critical reachable security, or private-media finding.

### Step 2: Apply the approved license consistently

After counsel/owner decision:

1. Add exact unmodified license text at root and decision record.
2. Set consistent package metadata. Do not blindly overwrite upstream license
   files; add root NOTICE/third-party notices explaining their scope.
3. If AGPL is chosen, provide the required prominent source-code offer in the
   network UI and link to the exact deployed source/version. Test it in gallery
   and admin.
4. If dual licensing is chosen, add reviewed commercial contact/process and a
   contributor agreement policy before external contributions.
5. If a source-available license is chosen, use accurate language everywhere;
   remove “open source” claims unless justified.

**Verify**: an approved license scanner recognizes the root project and retains
the upstream MIT notices; legal reviewer signs off.

### Step 3: Make public contribution and security expectations explicit

Add:

- `CONTRIBUTING.md`: setup, `pnpm check`, Docker smoke, migration rules, tenant
  isolation review, license/contributor terms.
- `SECURITY.md`: supported versions, private reporting channel, response
  expectations, exclusions, no public disclosure of credentials/tenant data.
- Code of Conduct and support policy distinguishing community self-host support
  from paid SaaS support.
- Issue/PR templates that request reproduction details without secrets.
- Dependabot/Renovate configuration with grouped, reviewed updates.

Do not promise an SLA unless the organization can staff it.

**Verify**: docs link checker passes; a fresh contributor can run the local gate
from documentation alone.

### Step 4: Produce reproducible release artifacts

Add a tag-driven workflow that:

1. reruns source, E2E, image, and smoke gates;
2. builds supported `linux/amd64` and `linux/arm64` images if Sharp/Prisma tests
   prove both;
3. publishes version and immutable digest tags to the approved registry;
4. generates SBOM and provenance, scans the final image, and signs artifacts
   using the approved identity/keyless method;
5. creates release notes with migration/backup/rollback instructions.

Add OCI labels for source URL, revision, version, license, and description.
Pin workflow actions by reviewed versions/SHAs according to security policy.

This step may prepare/test workflows on a private release candidate, but actual
public registry publication requires explicit operator approval.

**Verify**: a release candidate workflow or local equivalent produces an image
whose revision label matches HEAD; SBOM/provenance/signature verify; smoke passes
by digest.

### Step 5: Publish the self-host documentation and release checklist

README should lead with:

- what the product does and Telegram-only scope;
- live/demo media with no private content;
- 15-minute Compose quickstart link;
- exact supported storage/deployment modes;
- backup-before-upgrade warning;
- current limitations/non-goals;
- license, security, support, and hosted SaaS links.

Add a versioned upgrade guide for schema migrations and rollback. Define semantic
versioning before 1.0 and how breaking env/schema changes are announced.

Manual self-host release gate: clean VM, fresh DNS, BotFather setup, compose up,
admin upload/delete/reorder, gallery and album links, restart persistence,
backup+restore, upgrade from prior version, and rollback rehearsal.

**Verify**: a person who did not author the code completes the guide on a clean
VM without undocumented intervention.

### Step 6: Prepare a one-app Railway template

Create a source-based Railway template from the public GitHub repository after
approval, with:

- one app service built by root Dockerfile;
- managed PostgreSQL;
- an S3-compatible Railway bucket or clearly documented external S3/R2 choice;
- `DATABASE_URL` and bucket variables wired by references;
- required human inputs limited to Telegram/bot identity and app secrets;
- pre-deploy Prisma migration and `/api/health/ready` health check;
- `RUN_MIGRATIONS_ON_START=false`;
- no three-service admin/gallery topology.

Test template deploy, app health, both Mini App paths, upload flow, update path,
and teardown in a disposable Railway project. Do not advertise kickback as fixed
income; if mentioned internally, link to current terms (15% base/25% with
support as of planning date).

**External gate**: publishing to the Railway marketplace requires explicit
operator approval and an already-public, reviewed repository.

**Verify**: disposable template deployment reaches terminal SUCCESS, readiness
passes, full smoke passes, and no secret appears in template defaults/logs.

### Step 7: Run the SaaS production launch gate

Only after Plan 006 and professional review of Terms/Privacy/Acceptable Use:

1. Complete production bot profile, main/direct Mini Apps, `/paysupport`, support
   contact, privacy/terms links, and Stars test-to-production checklist.
2. Provision staging and production separately; restore-test production backup
   procedure before accepting users.
3. Run tenant isolation, quota concurrency, report/suspend, cleanup/reconcile,
   payment duplicate/renew/cancel/refund, and webhook backlog tests.
4. Start with one app replica if Plan 005 throttling is in-memory; document the
   scaling trigger and shared-store prerequisite.
5. Configure monitoring/alerts from runbooks, on-call ownership, abuse queue,
   and payment-support coverage.
6. Launch to a small allowlisted cohort, inspect usage/drift/support, then widen.

**External gate**: production deploy, webhook, bot changes, DNS, public launch,
and billing activation each require explicit operator approval.

**Verify**: launch checklist has named owner/date/evidence for every gate; no
open P0/P1 issue; rollback and suspension drill succeed.

## Test plan

- License/notice and full-history secret scans.
- Full `pnpm check`, build, image, Compose smoke, and clean-VM self-host test.
- Multi-architecture image smoke if both platforms are claimed.
- Release artifact digest/SBOM/provenance/signature verification.
- Disposable Railway template deployment and upstream-update rehearsal.
- SaaS staging end-to-end isolation, abuse, restore, and Stars scenarios.
- Public docs link and copy review with no unsupported claims.

## Done criteria

- [ ] Human-approved license strategy and decision record exist.
- [ ] Root/package licensing is consistent and upstream MIT notices remain.
- [ ] Full-history secret/ownership/license/security review has no unresolved
      release blocker.
- [ ] `pnpm check && pnpm build`, image build, and Compose smoke pass.
- [ ] Release candidate has verifiable digest, SBOM, provenance, and signature.
- [ ] Clean-VM self-host setup, persistence, backup/restore, and upgrade pass.
- [ ] Railway template uses one source-built app service and passes disposable
      deployment smoke.
- [ ] Terms/Privacy/AUP/support and SaaS launch gates are professionally reviewed.
- [ ] No external publication/deploy occurred without explicit approval.
- [ ] Only in-scope files plus `plans/README.md` changed.

## STOP conditions

Stop and report if:

- License/business objective or contributor ownership is unresolved.
- Any real credential/private media appears in current tree or history; rotate
  and resolve privately before publicity.
- A high/critical reachable vulnerability remains unmitigated.
- Release artifacts are not reproducible or cannot be tied to a source commit.
- The Railway template needs hardcoded secrets or restores the three-service
  topology.
- Legal/support/backup/abuse ownership is missing for SaaS launch.
- The next action would make a repo/artifact/template/deployment public without
  explicit operator approval.

## Maintenance notes

- Recheck Railway program terms at publication time; rates are not architecture.
- Keep source-offer links tied to deployed version if AGPL is selected.
- New contributors/assets/dependencies must update ownership/third-party notices.
- Release notes must call out migrations, required env changes, and rollback
  compatibility every time.
