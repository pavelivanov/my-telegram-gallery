# Plan 002: Add pluggable storage and safe direct-or-proxy media flows

> **Executor instructions**: Follow this plan step by step and run each
> verification gate. Stop on any condition listed below; do not substitute a
> different storage or upload design without review. Update `plans/README.md`
> when complete.
>
> **Drift check (run first)**:
> `git diff --stat 9282d53..HEAD -- apps/api/src/storage apps/api/src/photos apps/api/src/albums apps/api/prisma apps/api/.env.example apps/admin/src/api apps/admin/src/pages/AlbumPage package.json pnpm-lock.yaml`
> This plan was written against a dirty tree. In particular, the admin upload
> UI had uncommitted changes. Preserve them and stop if the upload flow no
> longer matches the excerpts below.

## Status

- **Priority**: P0
- **Effort**: L (4–6 days)
- **Risk**: MED
- **Depends on**: `plans/001-establish-verification-config-and-auth-baseline.md`
- **Category**: security, architecture
- **Planned at**: commit `9282d53`, 2026-07-13; dirty working tree

## Why this matters

The proposal correctly notices that the AWS SDK makes R2 mostly generic, but a
GET-only media proxy does **not** remove bucket CORS: the browser still uploads
directly to a presigned object-store URL. Self-hosting needs a proxy upload path
as well as proxy delivery, while SaaS should retain direct S3 transfers. The
current confirm endpoint also trusts a client-supplied object key, MIME type,
and size; that becomes a tenant-isolation and quota vulnerability later.

This plan creates one storage interface, filesystem and S3 implementations,
and one upload-intent state machine that supports both delivery modes without
changing the admin UI's two-stage behavior.

## Current state

- `apps/api/src/storage/r2.service.ts:16-26` hardcodes the Cloudflare endpoint,
  region, and `R2_*` variables around a generic `S3Client`.
- `apps/api/src/photos/photos.service.ts:22-27` generates a server key and a
  direct presigned PUT URL, but `confirmUpload()` at lines 75-105 accepts any
  `key`, declared MIME, and declared size from the client.
- `apps/admin/src/api/uploads.ts:25-63` performs `presign -> browser PUT ->
  confirm`, sending the server-provided key back during confirm.
- `apps/api/src/photos/photos.service.ts:35-72` reads the full original into
  memory and asks Sharp to create two WebP variants. There is no upload-size
  ceiling, image probe before persistence, or object metadata verification.
- `apps/api/src/albums/albums.service.ts:20-69` emits presigned storage URLs in
  every response. The frontends consume plain image URLs in `<img>` elements,
  which cannot attach the current `Authorization: tma ...` header.
- `apps/api/prisma/schema.prisma:20-35` has only `Photo`; there is no durable
  upload reservation/intention or idempotency state.
- Current object deletion is immediate and sequential at
  `apps/api/src/photos/photos.service.ts:145-153`.

Conventions to preserve:

- Controllers validate DTOs and delegate business rules to injected services.
- Keep `Photo.key`, `thumbKey`, and `previewKey` opaque outside the storage
  layer; public API response types expose URLs, not storage credentials.
- Keep the admin's concurrent staging and selection-order confirmation in
  `apps/admin/src/pages/AlbumPage/AlbumPage.tsx:170-191`.

## Target design

Use these distinct settings; do not collapse them into a single `MEDIA_MODE`:

- `STORAGE_DRIVER=filesystem|s3`
- `STORAGE_TRANSFER_MODE=proxy|direct`

Supported combinations:

| Driver | Proxy | Direct |
|---|---:|---:|
| filesystem | yes; self-host default | no; reject at startup |
| s3 | yes | yes; SaaS default |

Proxy means both upload bytes and image bytes cross the API origin. Direct
means presigned S3 PUT and GET URLs. In proxy delivery, the API returns a
short-lived application-signed media URL because `<img>` cannot send the TMA
Authorization header. The URL identifies `photoId + variant + expiry`, never a
raw object key.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Full gate | `pnpm check` | exit 0 |
| API tests | `pnpm --filter api test -- storage photos --runInBand` | all focused suites pass |
| Migration | `pnpm prisma:generate && pnpm test:e2e` | migration applies and E2E passes |
| Build | `pnpm build` | all apps build |

## Scope

**In scope**:

- `apps/api/prisma/schema.prisma` and one new migration
- `apps/api/src/storage/*` (rename/refactor as needed)
- `apps/api/src/photos/*`
- `apps/api/src/albums/albums.service.ts`
- `apps/api/src/media/*` (create)
- `apps/api/src/app.module.ts`
- `apps/api/src/config/env.ts`
- `apps/api/.env.example`
- `apps/admin/src/api/uploads.ts`
- `apps/admin/src/api/types.ts`
- API/unit/E2E tests and storage fakes for the above
- `package.json`, `apps/api/package.json`, and `pnpm-lock.yaml` only for required
  scripts/types/dependencies

**Out of scope**:

- Static serving and Docker/Compose files (Plan 003).
- Tenant tables or tenant-prefixed authorization (Plan 004). The intent must be
  related to an album now so Plan 004 can add `tenantId` without redesign.
- Plan quotas and storage reservations beyond a global upload maximum (Plan
  005).
- Moving existing object keys. Stored keys remain opaque and valid.
- Public non-Telegram galleries.
- Background queues or third-party image moderation.

## Git workflow

- Branch: `codex/002-storage-media-flows`
- Commit schema/state-machine changes separately from storage drivers and UI
  adaptation.
- Do not push, provision a bucket, or deploy.

## Steps

### Step 1: Define and test an object-storage contract

Create a storage token/interface and injected service with these capabilities:

- `put(key, readableOrBuffer, { contentType, contentLength })`
- `get(key)` returning stream, length, type, ETag/last-modified when available
- `stat(key)` returning authoritative stored length and type
- `delete(key)` (not-found is idempotent success)
- optional `presignPut` and `presignGet`, advertised by capability rather than
  assumed for every driver

Implement:

1. `FilesystemStorage`: root under validated `FILESYSTEM_STORAGE_PATH`, reject
   keys whose normalized path escapes the root, write atomically via a temporary
   file + rename, and never follow symlinks outside the root.
2. `S3Storage`: configure standard `S3_ENDPOINT` (optional for AWS),
   `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and
   `S3_FORCE_PATH_STYLE`. Map legacy `R2_*` variables as deprecated fallback
   aliases and preserve current R2 behavior when only those aliases are set.
3. Conditional startup validation for supported driver/transfer combinations.
4. A fake/in-memory implementation for unit tests; application services must
   inject the contract, not a concrete S3 class.

Do not accept an arbitrary filesystem key from any request. All keys remain
server-generated.

**Verify**: `pnpm --filter api test -- storage --runInBand` -> contract tests
pass for the filesystem driver and storage fake; S3 command construction is
unit-tested without network access.

### Step 2: Add a durable, idempotent upload-intent state machine

Add an `UploadIntent` Prisma model with at least:

- `id`, unique server-generated `key`, `albumId`
- `expectedMimeType`, `expectedSize`
- `status` enum `PENDING | UPLOADED | CONFIRMED | EXPIRED | FAILED`
- `expiresAt`, `createdAt`, `updatedAt`
- nullable unique `photoId` for idempotent confirmation

Relate it to `Album` and, after confirmation, `Photo`. Generate keys from
`albumId + intentId/random UUID`; the client never chooses or confirms by key.

Change upload creation DTO to require `albumId`, browser-reported MIME, and
size. Apply a configurable global maximum and an explicit allowlist of image
types. The response shape should be:

```ts
{
  uploadId: string;
  uploadUrl: string;       // S3 URL or same-origin API URL
  uploadMethod: 'PUT';
  expiresAt: string;
}
```

For `direct`, return a presigned S3 PUT. For `proxy`, return
`/api/photos/uploads/:uploadId/content`. The proxy PUT must require admin auth,
enforce expected content length while streaming, abort/delete partial files on
failure, and mark the intent uploaded. Do not buffer an unbounded request.

Confirmation accepts only `{ uploadId }`. It must:

1. Load the pending intent and related album.
2. `stat()` the server-owned key; reject missing, zero, oversized, or materially
   mismatched content.
3. Probe bytes with Sharp and accept only supported decodable image formats;
   derive actual width, height, and output MIME from server-side inspection.
4. Create variants with known byte counts.
5. In one DB transaction, create the `Photo` and mark the intent confirmed.
6. On repeated confirm, return the existing photo instead of duplicating it.
7. Delete objects and mark failed when validation fails.

Keep the current sequential confirmation behavior so display order remains
selection order.

**Verify**: `pnpm --filter api test -- photos --runInBand` -> tests cover direct
and proxy creation, arbitrary-key rejection by construction, actual-size
mismatch, invalid image, expiry, retry/idempotency, and partial upload cleanup.

### Step 3: Add safe proxy media URLs

Create a media URL signer using a separate validated
`MEDIA_URL_SIGNING_SECRET` (minimum 32 random bytes) and configurable expiry.
The signed message must bind `photoId`, requested variant
(`original|preview|thumb`), and expiry. Use constant-time signature comparison.

Add a no-TMA-header media endpoint such as:

`GET /api/media/photos/:photoId/:variant?expires=<unix>&signature=<base64url>`

The endpoint must:

- reject missing, expired, or invalid signatures before storage access;
- resolve the `Photo` and variant key from the database, not from request path;
- stream with accurate `Content-Type`/`Content-Length`, `nosniff`, and a cache
  lifetime no longer than the signature lifetime;
- return 404 for absent records/variants and never reveal a raw storage key.

In transfer mode `proxy`, album/photo serializers return these signed app URLs.
In `direct`, they continue returning presigned S3 GET URLs. Centralize URL
creation in a media service so albums and photos do not duplicate mode logic.

**Verify**: focused media tests cover valid stream, tampered photo/variant,
expired token, missing photo, and absence of object keys in API JSON.

### Step 4: Adapt the admin client without changing its UX

Change `stagePhoto()` to send file size at intent creation, PUT to the returned
URL regardless of whether it is S3 or same-origin API, and return `uploadId`
instead of key/MIME/dimensions. Change `confirmPhoto()` to send only
`uploadId`. Retain concurrent stage promises and sequential confirmation.

Use neutral error text (`Upload failed`) rather than `R2 upload failed`.

**Verify**: `pnpm --filter admin exec tsc --noEmit && pnpm --filter admin lint`
-> exit 0; manual dev test shows the existing pending/error UI still works.

### Step 5: Make deletion and expired intents recoverable

At minimum, make storage deletion idempotent and ensure a failed object delete
does not silently report complete success. Add a command/service method to:

- expire stale `PENDING/UPLOADED` intents;
- delete their known objects/variants;
- retain a failed state for retry instead of losing the reference.

Expose this as an explicit CLI command for now; Plan 005 will schedule it and
add usage reservation release. Do not add an in-process timer in this plan.

**Verify**: unit tests run cleanup twice with the same final state and no error.

## Test plan

- Model storage contract tests after service-level Jest tests, not real cloud
  integration tests.
- Add E2E coverage for proxy upload -> confirm -> album JSON -> signed media GET.
- Add a failure case where the declared MIME is image-like but Sharp cannot
  decode the object.
- Add a file larger than the configured maximum using a generated stream, not a
  committed binary fixture.
- Verify legacy R2 env maps to the same S3 endpoint configuration without
  logging credentials.

## Done criteria

- [ ] `pnpm check && pnpm build` exits 0.
- [ ] `pnpm test:e2e` proves the complete proxy flow on filesystem storage.
- [ ] `rg 'R2Service' apps/api/src` returns no matches outside a deliberate
      compatibility adapter/test.
- [ ] Confirm DTO contains `uploadId` only; no client-controlled object key.
- [ ] Proxy mode performs both upload and download through the API and requires
      no bucket CORS.
- [ ] Direct S3 mode remains supported and tested without live cloud calls.
- [ ] Invalid/oversized images never produce a persisted Photo.
- [ ] API JSON never exposes raw storage credentials or filesystem paths.
- [ ] No files outside scope plus `plans/README.md` changed.

## STOP conditions

Stop and report if:

- The selected S3-compatible provider cannot support the required HEAD/stat or
  presign operations.
- Proxy `<img>` delivery would require putting Telegram init data in a URL.
- The implementation accepts a raw storage key in any public request.
- Filesystem writes cannot be contained under one configured root.
- The work requires tenant schema changes; those belong in Plan 004.
- Existing uncommitted upload UI work would be overwritten.

## Maintenance notes

- Plan 003 will make filesystem + proxy the default self-host combination.
- Plan 004 must add `tenantId` to `UploadIntent` and generate new object keys
  under a tenant prefix; old stored keys stay valid.
- Plan 005 will reserve quota at intent creation, account for variant bytes,
  schedule cleanup, and reconcile usage.
- If the app later supports video, introduce a separate media-processing policy;
  do not broaden the image allowlist casually.
