# Plan 006: Add idempotent Telegram Stars subscription billing

> **Executor instructions**: Payment webhooks are untrusted, retried input.
> Persist idempotently before changing entitlement, answer pre-checkout within
> Telegram's deadline, and run every test in the Telegram test environment
> before production. Update `plans/README.md` when complete.
>
> **Drift check (run first)**:
> `git diff --stat 9282d53..HEAD -- apps/api/prisma apps/api/src apps/admin/src docs package.json pnpm-lock.yaml railway.json`
> Plans 001–005 must be complete. Stop if Tenant plan/status/grace fields or
> operator controls differ materially from this plan.

## Status

- **Priority**: P1
- **Effort**: L (5–8 days)
- **Risk**: HIGH
- **Depends on**: `plans/005-enforce-quotas-abuse-controls-and-operations.md`
- **Category**: direction, correctness, security
- **Planned at**: commit `9282d53`, 2026-07-13; dirty working tree

## Why this matters

Telegram Stars is the correct in-Telegram payment rail for this digital SaaS,
but payment success must be a server event, not a client callback. Telegram may
retry webhook updates; the same user can have multiple concurrent subscriptions;
renewals have explicit expiration dates; cancellation stops future renewal but
keeps access through the current paid period.

The goal is one Free -> Pro monthly subscription owned by a tenant owner, with
idempotent upgrades/renewals, cancel-at-period-end, grace/downgrade processing,
refund support, and `/paysupport` compliance.

## Current state

- The database models, small Bot API client, authenticated/deduplicated webhook,
  owner checkout API, entitlement service, billing UI, expiry/reconciliation
  commands, cancellation, refunds, and `/paysupport` are implemented.
- Automated tests cover first payment, renewal, duplicate and out-of-order
  delivery, invalid payer/currency/amount/checkout, owner/status revocation,
  grace, cancellation, refund, and a barrier-controlled renewal/expiry race.
- Remaining work is external acceptance and operation: approve the product and
  legal inputs, execute the real Telegram test-environment matrix, configure
  the prepared maintenance cycles in the production scheduler and alert
  channel, name operating owners, and explicitly authorize activation.

## Current platform constraints validated 2026-07-13

- Digital goods/services inside Telegram must use Stars with currency `XTR`.
- `createInvoiceLink`/invoice subscription uses `subscription_period=2592000`
  seconds (30 days); Stars pricing has one price line and a current maximum of
  10,000 Stars per subscription invoice.
- Telegram sends `pre_checkout_query`; the bot must answer within 10 seconds.
- Entitlement follows `successful_payment`, which includes
  `telegram_payment_charge_id`, optional `subscription_expiration_date`,
  `is_recurring`, and `is_first_recurring`.
- `editUserStarSubscription` cancels/re-enables renewal; cancellation must keep
  the subscription active to the end of its paid period.
- Store the Telegram charge ID for cancellation/refund. Support disputes and a
  `/paysupport` command.
- Webhooks may carry a configured `X-Telegram-Bot-Api-Secret-Token`; validate it
  on every update and deduplicate by `update_id`.

Before production acceptance, the executor must re-fetch current official
Telegram Bot API/Payments docs because these details are platform-controlled.

## Product inputs required before production activation

- Pro price in Stars and display copy.
- Grace duration after `subscription_expiration_date`.
- Refund policy and support contact.
- Whether one owner may pay for multiple tenants (recommended: yes, one
  independent checkout/subscription per tenant).
- Whether downgrade keeps excess content read-only (recommended) or deletes it
  (do not delete automatically).

## Commands you will need

| Purpose        | Command                                                          | Expected on success          |
| -------------- | ---------------------------------------------------------------- | ---------------------------- |
| Migration/E2E  | `pnpm prisma:generate && pnpm test:e2e`                          | billing E2E passes           |
| Focused tests  | `pnpm --filter api test -- billing telegram webhook --runInBand` | all pass                     |
| Full gate      | `pnpm check && pnpm build`                                       | exit 0                       |
| Expiry dry run | `pnpm billing:expire -- --dry-run`                               | deterministic candidate list |

## Scope

**In scope**:

- Billing/subscription/processed-update Prisma models and migration
- `apps/api/src/telegram/*`, `billing/*`, `webhooks/*` (create)
- tenant plan/status/grace updates through a single entitlement service
- admin billing/plan UI and `openInvoice` flow
- expiration/reconciliation/refund/cancel operator CLI commands
- webhook configuration script/runbook
- `/paysupport` bot response and support docs
- env validation/example for webhook secret, price, support contact
- billing unit/E2E/fixture tests
- privacy/terms hooks needed to describe billing behavior (final legal copy in
  Plan 007)

**Out of scope**:

- Stripe or other in-app payment providers.
- Annual/multi-month periods unless Telegram adds and the product approves them.
- Marketplace affiliates, gifts, tips, or multiple paid tiers.
- BYO-bot billing, revenue withdrawal automation, accounting/tax advice.
- Deleting over-limit content on downgrade.
- Deploying or setting a production webhook in this plan.

## Git workflow

- Branch: `codex/006-telegram-stars-billing`
- Commit schema/event ingestion before UI and operational commands.
- Never test charges in the production bot/account.

## Target data model

Add minimum records (names may match repository conventions):

- `BillingCheckout`: random ID used as invoice payload, tenant ID, payer TG ID,
  plan, expected Stars amount, status, expiry, timestamps.
- `Subscription`: unique tenant subscription, payer TG ID, plan/status,
  Telegram payment charge ID (unique when present), current period end,
  cancel-at-period-end, last payment time, timestamps.
- `BillingPayment`: unique Telegram charge ID, tenant, checkout/payer, amount,
  currency, recurring flags, period end, refund state, safe raw-event reference.
- `TelegramUpdate`: unique `updateId`, type, processed time/status/error summary
  for deduplication and operations. Do not persist full user payloads unless
  required; minimize PII.

Do not put tenant/price authority solely in invoice payload. Payload should be
an opaque checkout reference under Telegram's length limit; the server loads
and verifies authoritative checkout data.

## Steps

### Step 1: Add a small Bot API client and authenticated webhook

Use the platform `fetch` API or a very small typed wrapper; do not add a large
bot framework for four methods. Centralize redaction and error mapping for:

- `createInvoiceLink`
- `answerPreCheckoutQuery`
- `editUserStarSubscription`
- `refundStarPayment`
- webhook setup/status commands as operational tooling

Add `POST /api/telegram/webhook` outside TMA init-data auth but protected by
constant-time comparison of `X-Telegram-Bot-Api-Secret-Token` against validated
`TELEGRAM_WEBHOOK_SECRET`. Apply a tight JSON body limit and rate control.

Insert/deduplicate `update_id` before processing. Define retry behavior:

- duplicate processed update -> return 200 without repeating side effects;
- transient internal failure -> return non-2xx so Telegram retries;
- permanently invalid authenticated event -> record rejected summary and return
  200 to avoid an infinite retry loop.

Never log bot token, webhook secret, full invoice payload, or raw user details.

**Verify**: webhook tests cover missing/wrong secret, duplicate update, transient
retry, permanent reject, and redacted logs.

### Step 2: Create authoritative checkout and invoice links

Admin owner requests a Pro checkout for the currently selected tenant. Server:

1. verifies owner, active tenant, and product price config;
2. creates an expiring BillingCheckout with random opaque ID;
3. calls `createInvoiceLink` with `XTR`, exactly one price item, the approved
   amount, `subscription_period=2592000`, and payload referencing checkout;
4. returns only the invoice URL and checkout expiry.

The admin Mini App opens it using Telegram's invoice API. Client `invoiceClosed`
status is presentation only: refresh entitlement from server, never upgrade
locally.

Prevent accidental duplicate active subscriptions: if the tenant already has
active/canceling Pro, return current status instead of creating another invoice.
This is necessary because Telegram permits multiple subscriptions per user/bot.

**Verify**: unit tests assert exact Stars invoice fields and no invoice is
created for non-owner, suspended tenant, bad price, or existing active plan.

### Step 3: Validate pre-checkout within the deadline

For `pre_checkout_query`:

- load checkout by opaque payload;
- require pending/unexpired checkout;
- match payer Telegram ID, `currency=XTR`, exact amount, tenant, and plan;
- recheck tenant owner/status;
- call `answerPreCheckoutQuery` within 10 seconds with a user-safe failure
  message when invalid.

Do not perform image/storage reconciliation or other slow work in this path.
Record the decision idempotently, but prioritize answering Telegram within the
deadline.

**Verify**: fake Bot API clock tests prove answer is called for valid and every
invalid branch; integration test completes under a conservative local bound.

### Step 4: Grant/renew entitlement only from successful payment

For `successful_payment`:

1. validate authenticated webhook, checkout payload, XTR currency, exact amount,
   payer, and tenant.
2. require a Telegram charge ID and insert BillingPayment uniquely.
3. derive `currentPeriodEnd` from `subscription_expiration_date`; if absent on a
   purported subscription, reject/manual-review rather than inventing access.
4. in one transaction, upsert the tenant's Subscription, mark checkout paid,
   and set tenant entitlement to Pro through one EntitlementService.
5. For duplicate charge/update, return the already-applied state.
6. For renewal, extend to the authoritative later expiration; never shorten a
   period because updates arrive out of order.

Keep payment history immutable except explicit refund status. Do not store raw
bot tokens/events in rows.

**Verify**: tests cover first payment, renewal, duplicate update, duplicate
charge under different update, out-of-order older period, amount/payer mismatch,
and concurrent delivery. Tenant upgrades exactly once.

### Step 5: Implement cancel, expiry, grace, downgrade, and refund

- Cancel endpoint verifies owner then calls `editUserStarSubscription` with the
  stored charge ID and marks cancel-at-period-end. It does not downgrade now.
- Re-enable endpoint follows the same validation and clears the marker only
  after Telegram accepts.
- `billing:expire` bounded CLI/job finds subscriptions past period end, enters
  approved grace, then downgrades after grace if no later payment exists. Use a
  tenant lock and re-read before mutation to avoid racing renewal.
- Downgrade changes policy entitlement only. Existing excess albums/photos
  remain readable and new writes are blocked by Plan 005 until usage fits.
- Refund is operator-only, calls `refundStarPayment`, records outcome
  idempotently, and applies the approved entitlement/refund policy.

Add a reconciliation command comparing active DB subscriptions with recent
payment/expiry data available from Telegram where feasible; discrepancies go to
manual review, not silent deletion.

**Verify**: fake-clock tests cover active, canceling, renewed-before-expiry,
grace, downgrade, re-enable, refund success/failure, and job rerun.

### Step 6: Add billing UI and support obligations

Admin billing screen shows current plan, approved limits from Plan 005, current
period end, cancel state, upgrade/cancel actions, and support link. It must
refresh server state after invoice UI closes.

Webhook message handling must answer `/paysupport` with the configured support
contact and a safe request-ID/tenant-identification flow that does not ask users
to post bot tokens or payment credentials. Document dispute/refund operations
and response ownership.

Add explicit Terms/Privacy links before the pay action and record legal document
version accepted if counsel/product requires it.

**Verify**: frontend typecheck/lint/build, UI state tests, and a Telegram test-
environment manual run: create invoice, approve pre-checkout, successful first
payment, renewal fixture, cancel, re-enable, refund, `/paysupport`.

### Step 7: Write webhook and billing operations runbook

Document staging/production webhook setup with HTTPS URL, secret token,
`allowed_updates`, status verification, rotation, rollback, and pending-update
handling. Include alert conditions:

- webhook backlog/error;
- pre-checkout timeout/rejection spike;
- successful payment not reflected in entitlement;
- duplicate charge conflict;
- expiry job failure;
- refund failure.

Never embed the actual bot token/secret in commands committed to docs; use env
references/placeholders. Do not set the production webhook in this plan.

**Verify**: run the instructions against Telegram's test environment and a
disposable deployment, then return it to a clean state.

## Test plan

- Bot API HTTP contract tests with a local fake server.
- Webhook secret and `update_id` deduplication.
- Checkout/pre-checkout payer, amount, currency, tenant, expiry validation.
- First/recurring/out-of-order/duplicate payment cases.
- Transactional exactly-once entitlement under concurrent webhook deliveries.
- Cancel/re-enable/end-of-period/grace/downgrade/refund with fake time.
- UI never trusts `invoiceClosed` as payment success.
- Log/DB data minimization assertions.

## Done criteria

- [ ] `pnpm check && pnpm build` exits 0.
- [ ] Billing E2E proves exactly-once upgrade under duplicate/concurrent updates.
- [ ] Only verified `successful_payment` can grant Pro.
- [ ] Pre-checkout validates all authoritative fields and answers under 10s.
- [ ] Cancellation retains access through authoritative period end.
- [ ] Expiry/grace job is idempotent and renewal-race safe.
- [ ] `/paysupport` and operator refund flow work in Telegram test environment.
- [ ] Webhook secrets/tokens/payment PII are absent from logs and committed docs.
- [ ] Production webhook was not set.
- [ ] Only in-scope files plus `plans/README.md` changed.

## STOP conditions

Stop and report if:

- Product has not approved price, grace, refund, or downgrade behavior.
- Current official Telegram docs differ from the constraints above.
- A successful subscription event lacks an authoritative expiration date and no
  reviewed fallback exists.
- Multiple webhook replicas cannot share the same idempotency database safely.
- Any client callback or unauthenticated endpoint can upgrade Tenant.plan.
- Implementing support requires exposing payment identifiers publicly.

## Maintenance notes

- Telegram controls subscription capabilities; verify official docs before each
  billing change.
- Keep price/config versioned so old checkout payloads validate against the
  price that created them, not today's price.
- Add new paid tiers only after EntitlementService and policy-table tests can
  represent them without branching throughout services.
- Financial/tax/revenue-withdrawal processes require separate professional and
  operational work.
