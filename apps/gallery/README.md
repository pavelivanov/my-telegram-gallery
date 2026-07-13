# Gallery Mini App

The gallery Mini App lets Telegram users browse a tenant's albums and photos
and submit abuse reports. It resolves the tenant's name and built-in visual
preset before rendering, including from album deep links. Ordinary browsers
receive the product landing page unless an owner-enabled opaque public-gallery
hash is present. Production serves it from `/` in the repository's single
application image.

## Local development

Install dependencies and configure `apps/api/.env` as described in the
[root README](../../README.md), then run the API and gallery in separate
terminals:

```bash
pnpm dev:api
pnpm --filter gallery dev -- --port 5174
```

Vite proxies `/api` to `http://localhost:3000`. The optional
`VITE_API_BASE_URL` is only for reviewed split-origin development. Use
`pnpm --filter gallery dev:https -- --port 5174` or a trusted HTTPS tunnel when
testing inside Telegram.

## Verification

```bash
pnpm --filter gallery lint
pnpm --filter gallery build
```

The production deployment is built by the root Dockerfile. This package is not
published or deployed independently.

The frontend began from the Telegram Mini Apps React template; its upstream MIT
notice remains in [LICENSE](LICENSE).
