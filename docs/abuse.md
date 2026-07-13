# Abuse response runbook

The in-gallery report action is the primary structured intake path. Before a
public launch, publish a monitored abuse/appeal contact in the bot profile and
service terms. Do not promise a response channel that is not staffed.

## Intake and targets

Reports accept a bounded reason, optional 500-character detail, and optional
album/photo target. One reporter cannot create duplicate open reports for the
same target, and the report route has its own rate profile. User text is stored
for operator review and is never rendered as HTML.

Launch response targets:

- credible imminent-harm or clearly illegal-content report: acknowledge and
  triage as soon as staffed, target under 4 hours;
- privacy, harassment, or copyright report: target initial review within 1
  business day;
- spam/other: target initial review within 3 business days.

These are operational targets, not legal advice. Escalate jurisdiction-specific
requests to qualified counsel. Preserve request IDs, report IDs, actor/audit
records, and the minimum evidence necessary; never paste image contents or user
credentials into general chat.

## Triage

1. Authenticate with the separate operator CLI credential.
2. List open reports in a bounded page and record report/tenant IDs.
3. Inspect safe tenant status/usage metadata. Access content only when required
   for the report and permitted by policy.
4. If continued access creates material risk, suspend the tenant immediately
   with a concise reason. Suspension hides the public gallery and blocks owner
   mutations while preserving rows, objects, usage, and audit evidence.
5. Classify the report, note evidence source and legal/privacy constraints, and
   assign an operator.

## Resolution

- **Dismiss:** record why the report does not violate policy; dismiss it through
  the CLI. Do not retaliate against the reporter.
- **Resolve without deletion:** record remediation, resolve the report, and
  unsuspend only after all relevant reports/risks are reviewed.
- **Takedown:** preserve required evidence first, obtain the approved decision,
  then use a separately reviewed deletion procedure. The launch CLI deliberately
  has no bulk content-delete action.
- **Emergency/legal request:** preserve data, restrict access, record chain of
  custody, and escalate. Do not volunteer unrelated tenant/user data.

Every suspension, unsuspension, resolution, and dismissal is audited with the
separate operator identity. Tenant-owner authentication can never perform these
actions.

## Appeal and communication

The published contact must accept report IDs and tenant slugs, not bot tokens,
init data, signed URLs, or passwords. A different operator should review an
appeal when staffing permits. Record the outcome and reason; unsuspension is a
separate audited action, not an automatic side effect of resolving one report.

Use neutral messages. Do not expose reporter identity/detail to the tenant owner.
The owner admin shows suspension, safe usage, and the count of reports under
review only.

## Preservation and deletion

Preserve only what policy/legal obligations require, encrypt it, restrict access,
and record an expiry date. Normal tenant deletion, reporter data deletion, legal
holds, and backup expiry must be reconciled: a legal hold pauses deletion only
for its documented scope. When the hold/retention window ends, remove preserved
copies and allow backup lifecycle expiry.

Review this runbook and the public policy before launch and after every material
incident. Automated image classification and bulk moderation are intentionally
out of scope for the launch implementation.
