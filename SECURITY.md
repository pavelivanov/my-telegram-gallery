# Security policy

## Supported versions

There is no public supported release yet. Security support begins only after a
version is published with named maintainers and a reviewed private reporting
channel. Until then, every release candidate is unsupported and must remain
private.

## Reporting a vulnerability

Do not open a public issue containing a vulnerability, credential, Telegram
init data, tenant identity, payment identifier, private image, database output,
or production log.

For a future public repository, use GitHub's **Security → Advisories → Report a
vulnerability** flow. Publication is blocked until private vulnerability
reporting is enabled and a named owner has tested it. If that option is not
available, contact the repository owner through their GitHub profile only to
request a private channel; do not include technical details in the initial
message.

Include the affected revision, impact, minimal reproduction, and whether any
real data or credentials were involved. Replace all sensitive values with
synthetic placeholders. Do not retain or access data beyond what is necessary
to demonstrate the issue.

## Response and disclosure

Maintainers will privately validate scope, coordinate credential rotation or
containment, prepare a fix, and agree on disclosure timing. No response-time or
remediation SLA is promised before a staffed policy is approved. Reporters must
not publish details while a fix or credential rotation is in progress.

Security review does not cover compromised self-host infrastructure, lost bot
tokens, unsupported source modifications, or third-party platform outages, but
reports showing a product vulnerability in those scenarios are still welcome.
