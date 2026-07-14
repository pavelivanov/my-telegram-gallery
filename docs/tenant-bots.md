# Tenant-owned Telegram bots

Multi mode can optionally connect one Telegram bot to one gallery. This is a
white-label identity boundary, not a separate deployment: the tenant bot's
Admin and Gallery Mini Apps still point to this service's `/admin/` and `/`
paths.

The feature is deliberately narrower than full per-bot operations:

- the owner can verify, connect, rotate, and disconnect a bot;
- gallery, album, admin, and public-browser-to-Telegram links use that bot;
- Mini App init data signed by that bot is accepted only for its bound tenant;
- connecting does **not** call `setWebhook`, mutate BotFather, or route Stars
  billing and `/paysupport` through the tenant bot.

Single mode already uses the operator-configured `TELEGRAM_BOT_TOKEN` and does
not store a second token in PostgreSQL.

## Configure encryption

Tenant bot tokens are optional and disabled until
`TENANT_BOT_ENCRYPTION_KEYS` is configured. Generate a 256-bit key without
printing any existing secret:

```bash
node -e 'console.log("v1:"+require("node:crypto").randomBytes(32).toString("base64url"))'
```

Store the result in the app's secret manager, not in Git:

```dotenv
TENANT_BOT_ENCRYPTION_KEYS="v1:BASE64URL_32_BYTE_KEY"
```

The first comma-separated entry encrypts new and owner-rotated credentials.
Later entries are decrypt-only, allowing key rotation:

```dotenv
TENANT_BOT_ENCRYPTION_KEYS="v2:NEW_KEY,v1:PREVIOUS_KEY"
```

Keep every referenced key until no `TenantBotCredential` row uses it. Owners
can submit their current BotFather token again to verify it and re-encrypt the
row with the active key. Before removing an old key, inspect counts on a private
operator connection:

```sql
SELECT "keyId", COUNT(*) FROM "TenantBotCredential" GROUP BY "keyId";
```

Removing an in-use key makes that tenant bot unable to authenticate. It does
not expose plaintext, and the shared service bot remains the recovery path.

## Connect a tenant bot

1. In BotFather, create or choose a bot owned by the tenant.
2. Create two Mini Apps under that bot. Point Gallery at the service root and
   Admin at `/admin/`. Record both short names exactly.
3. Enter the shared service bot's Admin Mini App, select the gallery, and open
   **Bot**. Only the `OWNER` role can see or mutate this setting.
4. Paste the BotFather token and both short names. The API calls Telegram
   `getMe`; it accepts only a named bot identity.
5. Use the generated links. They include `startapp=tenant_<slug>` because the
   signed init data must identify which encrypted credential may validate it.

The API response contains the public bot username, Mini App short names, and
verification time. It never returns the token, ciphertext, IV, authentication
tag, or encryption key ID.

## Isolation model

The shared service bot remains valid for all tenants. A tenant bot is different:
its signed init data receives an internal `botTenantId` boundary. Tenant
selection must resolve to that exact database tenant on every content route.
Tenant list/detail and creation routes apply the same restriction directly.

This prevents a compromised tenant A token from forging a Telegram identity
and selecting tenant B. Tenant slugs, headers, and start parameters remain
selectors; database membership still authorizes owner/admin mutations.

There is intentionally no cross-request token cache in this foundation.
Rotation and disconnect therefore take effect on the next request in every app
replica, at the cost of one indexed credential lookup and decrypt for a valid
tenant-bot request.

## Rotation, disconnect, and recovery

- **BotFather token rotation:** revoke/rotate the token in BotFather, then use
  **Verify and rotate** from the shared service bot. The previous token stops
  validating immediately after the database update.
- **Encryption-key rotation:** deploy a new first key while retaining old keys,
  re-verify each connected bot, confirm old-key row counts are zero, then remove
  the old key in a later deployment.
- **Disconnect:** use the shared service bot's Admin Mini App. The credential
  row is deleted and its custom Mini App links stop authenticating immediately.
- **Lost tenant bot:** do not disconnect the shared service bot or remove the
  owner's membership. Use that recovery path to rotate or remove the tenant
  credential.

If a token may have leaked, rotate it in BotFather first, preserve relevant
request/audit evidence, and then replace it in the Admin Mini App. Never paste a
token into support chat, issue text, logs, or CLI arguments.

## Deferred work

Per-tenant webhook registration, webhook-secret rotation, commands,
`/paysupport`, Stars invoice/payment routing, BotFather automation, and token
validation caching remain out of scope. They need an explicit per-bot update
router and payment/support ownership model before activation.
