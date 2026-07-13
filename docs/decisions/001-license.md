# Decision 001: Project license and contributor rights

- Status: **Pending owner and counsel decision**
- Release impact: **Blocks public source and artifact distribution**
- Last reviewed: 2026-07-13

## Context

The repository is private, the API package is marked `UNLICENSED`, and no root
license grants redistribution rights. The two frontend subdirectories preserve
MIT notices from their upstream Telegram Mini Apps template. Those notices do
not license the repository's original code as a whole.

An “AGPL plus hosted exception” is not a complete business or legal decision.
AGPL network-source obligations do not prohibit a competing hosted service, and
adding a hosting restriction would generally make the result source-available
rather than open source.

## Options requiring approval

1. **AGPL-3.0-only plus a separate commercial license** when network copyleft
   and dual licensing fit the business. Contributor ownership/CLA policy must
   preserve commercial relicensing rights.
2. **Apache-2.0 or MIT** when adoption and ecosystem simplicity matter more than
   hosted copyleft.
3. **Counsel-drafted source-available terms** when restricting competing SaaS
   is the actual objective. Documentation must not call this open source unless
   the final license is OSI-approved and meets that definition.

## Decision required

The copyright owner must record:

- the chosen objective and exact unmodified or counsel-approved license text;
- who owns the original commits and whether employer/client rights apply;
- whether outside contributions are accepted and under what agreement;
- the commercial licensing contact/process, if any;
- any required in-product source offer and deployed-version link.

Until this status changes to **Accepted**, do not add a root `LICENSE`, change
package license metadata, accept external contributions, make the repository
public, or publish images/templates. No license choice is implied by the release
engineering artifacts in this repository.
