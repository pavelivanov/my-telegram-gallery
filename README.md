# my-telegram-gallery

Telegram Mini App: upload photos, browse them as a gallery.

## Stack

| Piece    | Tech                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| Frontend | [TMA reactjs-template](https://github.com/Telegram-Mini-Apps/reactjs-template) (React + Vite)      |
| Backend  | NestJS + Prisma (PostgreSQL)                                                                       |
| Storage  | Cloudflare R2 (S3-compatible, presigned URLs)                                                      |
| Hosting  | Railway (two services: `web`, `api`, plus a Postgres add-on)                                       |

## Layout

```
apps/
  web/   # Telegram Mini App frontend (Vite + React)
  api/   # NestJS API: Prisma, R2 storage, Telegram init-data auth
```

## Upload flow

1. `POST /api/photos/upload` → API returns a presigned R2 PUT URL + object key.
2. Client uploads the file directly to R2.
3. `POST /api/photos/confirm` → API persists the photo record.
4. `GET /api/photos` → list with presigned GET URLs.

All endpoints require `Authorization: tma <initDataRaw>` (validated against `TELEGRAM_BOT_TOKEN`).

## Local development

### Prerequisites

- Node.js >= 22 and pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL — easiest via Docker:

  ```bash
  docker run -d --name gallery-db \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=gallery \
    -p 5432:5432 postgres:17
  ```

- A Telegram bot token from [@BotFather](https://t.me/BotFather) (needed by the API to validate Mini App init data)
- Cloudflare R2 bucket + API token (see [R2 setup](#r2-setup)) — required for uploads; list/auth endpoints work without it

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

Fill in `apps/api/.env`:

- `DATABASE_URL` — the default matches the Docker command above
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `R2_*` — from the Cloudflare R2 dashboard

### 3. Create the database schema

```bash
pnpm prisma:migrate    # runs `prisma migrate dev` in apps/api
```

### 4. Run the API

```bash
pnpm dev:api           # NestJS in watch mode → http://localhost:3000/api
```

### 5. Run the web app

```bash
pnpm dev:web                  # plain HTTP — http://localhost:5173
# or, for testing inside Telegram (needs HTTPS; local SSL certs via mkcert):
pnpm --filter web dev:https   # https://localhost:5173
```

`dev:https` may ask for your sudo password on first run — `vite-plugin-mkcert`
needs it to install a local CA.

To open the app inside Telegram, point your bot's Mini App URL (@BotFather →
`/myapps`) at the dev URL. Telegram requires HTTPS, so use `dev:https` with the
`https://127.0.0.1:5173` URL (works in Telegram Desktop / Web), or tunnel the
dev server (e.g. `ngrok http 5173`) for testing on a phone.

More detail on the frontend setup: [apps/web/README.md](apps/web/README.md).

## Deploy (Railway)

Create one Railway project with:

1. **Postgres** add-on (provides `DATABASE_URL`).
2. **api** service — root directory `/`, config file `apps/api/railway.json`.
   Env: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `WEB_ORIGIN`.
3. **web** service — root directory `/`, config file `apps/web/railway.json`.

Point the Mini App URL in [@BotFather](https://t.me/BotFather) at the deployed `web` domain.

## R2 setup

1. Cloudflare dashboard → R2 → create bucket (e.g. `gallery`).
2. Create an R2 API token (Object Read & Write), copy the access key pair.
3. Add a CORS rule on the bucket allowing `PUT`/`GET` from the web origin
   (needed for direct browser uploads via presigned URLs).
