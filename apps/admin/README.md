# Administrator Mini App

The administrator Mini App lets a gallery owner select a tenant, manage albums,
upload and reorder photos, review usage, and manage a Telegram Stars
subscription. Production serves it from `/admin/` in the repository's single
application image.

## Local development

Install dependencies and configure `apps/api/.env` as described in the
[root README](../../README.md), then run the API and administrator app in
separate terminals:

```bash
pnpm dev:api
pnpm dev:admin
```

Vite proxies `/api` to `http://localhost:3000`. The optional
`VITE_API_BASE_URL` is only for reviewed split-origin development. Use
`pnpm --filter admin dev:https` or a trusted HTTPS tunnel when testing inside
Telegram.

## Verification

```bash
pnpm --filter admin test
pnpm --filter admin lint
pnpm --filter admin build
```

The production deployment is built by the root Dockerfile. This package is not
published or deployed independently.

The frontend began from the Telegram Mini Apps React template; its upstream MIT
notice remains in [LICENSE](LICENSE).
