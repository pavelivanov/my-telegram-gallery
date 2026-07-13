# Release process

There is no public release yet. This process creates a private, traceable
candidate and stops before registry publication, signing, deployment, or a Git
tag unless every human gate is approved.

## Versioning

Use Semantic Versioning. Before `1.0.0`, increment:

- patch for compatible fixes and documentation;
- minor for new features or an announced breaking environment/API/schema
  change;
- major only after the project commits to a stable `1.x` compatibility policy.

Every release note must list new/removed environment variables, Prisma
migrations, backup requirements, storage effects, compatibility, and rollback
limits. Database migrations are forward-only; an older image may require the
matching pre-upgrade database backup.

## Private candidate

From a clean reviewed commit:

```bash
RELEASE_VERSION=0.1.0-rc.1 pnpm release:candidate
```

The candidate command:

1. reruns the frozen install, dependency audit, source/E2E gate, and build;
2. scans complete Git history with Gitleaks and redaction;
3. builds the pinned Node base image with OCI source, revision, created, and
   version labels;
4. verifies the non-root runtime, exact labels, absence of embedded environment
   files/secret-shaped image defaults, and native Sharp execution;
5. runs the disposable Compose smoke test;
6. creates production-license inventory and a CycloneDX image SBOM;
7. fails on high/critical Grype image findings;
8. saves the image and scans that archive for secrets;
9. writes the image, metadata, reports, and `SHA256SUMS` under
   ignored `output/release/`.

The manual GitHub workflow performs the same source gate and uploads the output
as a private seven-day artifact. It has read-only repository permissions and no
package, attestation, or identity-token permission.

The candidate is traceable to an exact commit and checksummed artifact. A
bit-for-bit reproducibility claim is not made while Alpine package indexes and
scanner vulnerability databases remain time-varying. Pinning those inputs or
documenting an approved reproducible-build exception remains a release gate.

## Release-note template

Every candidate and release review must complete this structure. Use `None`
rather than removing a section.

```markdown
# VERSION (candidate or release)

- Source revision:
- Image digest/platforms:
- Previous supported version:
- Publication status:

## User-visible changes
## Security and dependency changes
## New, changed, and removed environment variables
## Prisma migrations and expected duration
## Storage/data effects
## Required backup and verified restore evidence
## Upgrade procedure and compatibility
## Rollback procedure and point-of-no-return limits
## Known findings and accepted risks
## Artifact checksum, SBOM, provenance, and signature verification
```

## Clean-machine acceptance checklist

A reviewer who did not author the change must record command output or a
sanitized evidence link for each item on a newly provisioned machine:

- [ ] install the documented Docker/Compose prerequisites and clone the exact
      candidate revision;
- [ ] configure fresh DNS/TLS and a test BotFather bot with both Mini App paths;
- [ ] initialize configuration without printing secrets, start Compose, and
      verify readiness/liveness;
- [ ] open admin and gallery in Telegram, upload an image, generate/read all
      variants, reorder and delete it, and open gallery/album deep links;
- [ ] restart the stack and prove database/media persistence;
- [ ] create a backup, restore it into a disposable installation, and compare
      tenant, album, photo, and object counts;
- [ ] upgrade from the previous supported version with the documented migration
      procedure and verify behavior;
- [ ] rehearse the documented application rollback and the matching database
      recovery boundary;
- [ ] inspect logs, image config, and final files for credentials/private data,
      then tear down the disposable environment.

This checklist is intentionally open until an independent clean-machine run is
performed; the local Compose smoke test is necessary but not a substitute.

## Verification and publication gates

Before publication, independently verify `SHA256SUMS`, load the image archive,
compare its revision label with the release commit, and rerun the smoke test.
Then require evidence for:

- accepted license/ownership/contributor decision;
- zero unresolved secret, license, or reachable high/critical finding;
- clean-VM setup, persistence, backup/restore, upgrade, and rollback;
- reviewed registry, image-signing identity, SBOM/provenance/attestation flow;
- supported CPU architectures (currently no multi-architecture claim);
- staffed security/support contacts and reviewed public copy.

Creating a tag, pushing a registry image, publishing a Railway template, making
the repository public, deploying production, changing DNS/BotFather, or
enabling a production billing webhook each requires explicit operator approval.
