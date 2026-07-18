# Decision 001: Project license and contributor rights

- Status: **Accepted**
- Decision date: 2026-07-18
- Release impact: **License selected; ownership, CLA, commercial contact, and publication approval still block release**
- Last reviewed: 2026-07-18

## Context

The repository has remained private and unpublished while the licensing choice
was reviewed. The two frontend subdirectories preserve MIT notices from their
upstream Telegram Mini Apps template. Those notices apply to the incorporated
template material and do not replace the root license for original project
code.

An “AGPL plus hosted exception” is not a complete business or legal decision.
AGPL network-source obligations do not prohibit a competing hosted service, and
adding a hosting restriction would generally make the result source-available
rather than open source.

## Decision

The original project code is licensed **AGPL-3.0-only**. The unmodified license
text is in the root `LICENSE` file. Eligible copyright holders may separately
offer commercial licenses through a distinct written agreement; the repository
itself grants no commercial exception or additional permission.

Every deployed network UI must prominently offer users the corresponding source
and link to the exact deployed source revision. Release images embed the source
revision and version used by the public-config endpoint.

External contributions are not accepted until a professionally reviewed CLA is
adopted. The CLA must give the relevant copyright holders sufficient rights to
continue offering separate commercial licenses. Merely adding a `Signed-off-by`
line or using a developer certificate of origin is not an approved substitute.

## Unresolved release prerequisites

This decision does not resolve or authorize:

- confirmation of all original-code copyright holders and any employer/client
  rights;
- the reviewed CLA text or contributor onboarding process;
- the commercial licensing contact, commercial terms, or contract process;
- legal review of copyright notices and public-facing product terms;
- making the repository public, publishing a container/template, deploying an
  environment, or changing any external service.

No external contribution may be accepted and no external publication or
deployment may occur until the relevant prerequisite and a separate explicit
approval are recorded.
