# Telegram Stars billing runbook

Telegram Stars billing is optional and disabled until every billing setting is
present. The repository defaults Bot API calls to Telegram's separate test
environment. Do not flip that default or set a production webhook until the
entire test checklist below passes with an approved price, refund policy,
support contact, Terms, and Privacy notice.

Official references should be rechecked before every launch because Telegram
controls this contract:

- [Bot API payments](https://core.telegram.org/bots/api#payments)
- [Stars for digital goods](https://core.telegram.org/bots/payments-stars)
- [Mini Apps test environment](https://core.telegram.org/bots/webapps#using-bots-in-the-test-environment)

The implementation currently targets Bot API 10.1: `XTR`, one price line,
`subscription_period=2592000`, a maximum of 10,000 Stars, pre-checkout answers
within 10 seconds, and authoritative recurring expiration dates. The Stars
invoice deliberately omits `provider_token`.

## Enable a disposable test installation

Use a bot and Telegram account created in Telegram's test environment. Test and
production bots/accounts are separate. Configure an explicit product decision;
there is no repository default price or support identity:

```dotenv
TELEGRAM_BOT_API_TEST_MODE=true
TELEGRAM_WEBHOOK_SECRET=<32-256 random A-Z/a-z/0-9/_/- characters>
BILLING_PRO_PRICE_STARS=<approved integer from 1 to 10000>
PAY_SUPPORT_CONTACT=<staffed contact shown to customers>
BILLING_TERMS_URL=https://example.test/terms
BILLING_PRIVACY_URL=https://example.test/privacy
```

Generate the webhook secret independently from the bot, media-signing, and
operator tokens. Keep the raw value only in the secret manager/environment:

```bash
openssl rand -base64 48 | tr -dc 'A-Za-z0-9_-' | head -c 48
```

Run migrations, deploy the disposable HTTPS installation, and verify readiness.
The owner billing page must visibly say **Telegram test mode**.

## Set and inspect the test webhook

Webhook tooling uses the bot token from the environment and also requires the
separate operator CLI identity described in [operations.md](operations.md). The
actual token and secret never appear in command arguments or committed docs.

```bash
export OPS_TOKEN=<raw operator token in this shell only>
pnpm telegram:webhook -- status
pnpm telegram:webhook -- set \
  --url https://staging.example.test/api/telegram/webhook
pnpm telegram:webhook -- status
```

`set` registers exactly `message` and `pre_checkout_query` updates and sends the
configured secret in `X-Telegram-Bot-Api-Secret-Token`. Status output excludes
bot credentials, webhook secrets, and URL query data.

Do not pass `--drop-pending` during ordinary setup or rotation. It irreversibly
discards queued updates and is only for an explicitly approved reset after the
queue has been inspected and reconciled.

## Test-environment acceptance checklist

- [ ] Non-owner and suspended-tenant checkout attempts are rejected.
- [ ] The invoice shows the approved Stars price and a 30-day recurring period.
- [ ] A valid pre-checkout is answered in under 10 seconds; payer, amount,
      currency, checkout, owner, and tenant status mismatches are declined.
- [ ] Closing/canceling the invoice does not change the plan.
- [ ] A successful first payment changes the server state to Pro exactly once.
- [ ] Duplicate update and duplicate-charge fixtures do not extend twice.
- [ ] A renewal fixture advances to Telegram's later expiration and an older
      out-of-order event never shortens the period.
- [ ] Stop renewal preserves Pro through the current period; re-enable works.
- [ ] Expiry enters seven-day grace, then downgrades without deleting content.
- [ ] `/paysupport` returns the staffed contact and safe identification advice.
- [ ] An approved test refund is audited and produces the expected entitlement.
- [ ] `pnpm billing:reconcile -- --limit 1000` reports zero discrepancies.
- [ ] Webhook status has zero pending updates and no recent error.

The automated PostgreSQL suite covers these event and race cases with a fake Bot
API. It cannot replace the checked manual run in Telegram's test environment.

## Scheduled jobs and reconciliation

Run expiry at least hourly. It is bounded, requires an explicit mode, locks and
re-reads the tenant, and is safe against a concurrent renewal:

```bash
pnpm billing:expire -- --dry-run --limit 500
pnpm billing:expire -- --apply --limit 500
pnpm billing:expire -- --apply --limit 500
```

The second apply should have no work. Reconciliation is read-only because the
Bot API does not expose an authoritative per-tenant subscription lookup. It
flags local payment/period/plan inconsistencies for manual review and never
silently deletes or downgrades:

```bash
pnpm billing:reconcile -- --limit 500
pnpm billing:reconcile -- --tenant TENANT_SLUG --limit 100
```

## Cancellation and refunds

Cancellation calls `editUserStarSubscription` with the stored first charge ID
and only disables future renewal. Access remains Pro until Telegram's period end
and then the seven-day grace policy applies.

Refunds are operator-only and require a reason:

```bash
pnpm ops -- payment refund \
  --payment BILLING_PAYMENT_ID \
  --reason "Approved support case"
```

A refund of the latest entitlement-bearing payment first disables renewal,
then refunds the charge and downgrades immediately. Refunding an older payment
does not remove access backed by a later unrefunded payment. A failed refund is
recorded as failed and retains entitlement for review. An in-flight `PENDING`
refund is never blindly repeated because Telegram may have accepted the
external side effect before the local final write; reconcile it manually.

Every completed refund writes one `PAYMENT_REFUNDED` operator audit. The audit
stores the internal payment ID and outcome, not the Telegram charge ID.

## Alerts and incident response

Alert on:

- nonzero webhook `pending_update_count` or recent `last_error_date`;
- pre-checkout timeout/rejection spikes;
- successful payment rows whose tenant is not Pro;
- a duplicate charge conflict or `RETRYABLE` update older than one minute;
- expiry job failure or a reconciliation discrepancy;
- `FAILED` or long-running `PENDING` refunds.

For payment/entitlement mismatch, preserve the update/payment/audit rows, stop
new checkout if scope is unknown, inspect by internal IDs, and avoid asking the
customer for bot tokens, init data, passwords, or payment credentials. Use the
request ID displayed by the app plus tenant slug/report ID.

## Rotation, rollback, and production gate

To rotate the webhook secret, place a new secret in the deployment, restart the
single app replica, immediately call webhook `set` so Telegram sends the new
header, then verify status and a test update. A brief 401/retry window is safer
than accepting two secrets indefinitely. Roll back by restoring the prior app
secret and re-registering it, without dropping pending updates.

To disable delivery while preserving the queue decision:

```bash
pnpm telegram:webhook -- delete
```

Only after the acceptance checklist and Plan 007 legal/release gate may an
operator use the separate production bot/account, set
`TELEGRAM_BOT_API_TEST_MODE=false`, and register the production HTTPS webhook.
That production action is intentionally not performed by this plan.
