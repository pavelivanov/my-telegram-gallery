# my-telegram-gallery

Two Telegram Mini Apps sharing one API: the **admin** app uploads photos, the
**gallery** app shows them to everyone else.

## Stack

| Piece    | Tech                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- |
| Frontend | [TMA reactjs-template](https://github.com/Telegram-Mini-Apps/reactjs-template) (React + Vite) × 2  |
| Backend  | NestJS + Prisma (PostgreSQL)                                                                       |
| Storage  | Cloudflare R2 (S3-compatible, presigned URLs)                                                      |
| Hosting  | Railway (services: `admin`, `gallery`, `api`, plus a Postgres add-on)                              |

## Layout

```
apps/
  admin/    # Mini App for the admin: upload & delete photos
  gallery/  # Mini App for everyone: browse the gallery
  api/      # NestJS API: Prisma, R2 storage, Telegram init-data auth
```

One Telegram bot hosts both Mini Apps (created via @BotFather → `/newapp`,
one short name each), so the API validates init data of both with a single
`TELEGRAM_BOT_TOKEN`. Write endpoints additionally require the caller's
Telegram id to equal `ADMIN_TG_ID`.

## API

All endpoints require `Authorization: tma <initDataRaw>`.

| Endpoint                  | Who    | Purpose                              |
| ------------------------- | ------ | ------------------------------------ |
| `GET /api/photos`         | anyone | list photos with presigned GET URLs  |
| `POST /api/photos/upload` | admin  | get presigned R2 PUT URL + key       |
| `POST /api/photos/confirm`| admin  | persist record after direct upload   |
| `DELETE /api/photos/:id`  | admin  | remove from R2 + database            |

Upload flow: `upload` → PUT file straight to R2 → `confirm`.

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

- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram user id (ask [@userinfobot](https://t.me/userinfobot)) for `ADMIN_TG_ID`
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
- `ADMIN_TG_ID` — your Telegram user id
- `R2_*` — from the Cloudflare R2 dashboard

### 3. Create the database schema

```bash
pnpm prisma:migrate    # runs `prisma migrate dev` in apps/api
```

### 4. Run the API

```bash
pnpm dev:api           # NestJS in watch mode → http://localhost:3000/api
```

### 5. Run the Mini Apps

Both apps read `VITE_API_BASE_URL` (defaults to `http://localhost:3000`);
copy `.env.example` to `.env` inside `apps/admin` / `apps/gallery` to override.

```bash
pnpm dev:admin                  # admin app, plain HTTP
pnpm dev:gallery                # gallery app, plain HTTP
# or, for testing inside Telegram (needs HTTPS; local SSL certs via mkcert):
pnpm --filter admin dev:https
pnpm --filter gallery dev:https
```

`dev:https` may ask for your sudo password on first run — `vite-plugin-mkcert`
needs it to install a local CA.

To open an app inside Telegram, point the corresponding Mini App URL
(@BotFather → `/myapps`) at the dev URL. Telegram requires HTTPS, so use
`dev:https` with the `https://127.0.0.1:5173` URL (works in Telegram Desktop /
Web), or tunnel the dev server (e.g. `ngrok http 5173`) for testing on a phone.

More detail on the frontend setup: [apps/gallery/README.md](apps/gallery/README.md).

## Deploy (Railway)

One Railway project with:

1. **Postgres** add-on (provides `DATABASE_URL`).
2. **api** service.
   Env: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `ADMIN_TG_ID`, `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `WEB_ORIGINS`
   (comma-separated admin + gallery origins).
3. **admin** and **gallery** services.

Each app ships its own `railway.json`; deploy by uploading the app directory
as the service root:

```bash
railway up apps/api --path-as-root --service api --ci
railway up apps/admin --path-as-root --service admin --ci
railway up apps/gallery --path-as-root --service gallery --ci
```

In @BotFather, create two Mini Apps on the same bot (`/newapp`) and point them
at the deployed `admin` and `gallery` domains.

## R2 setup

1. Cloudflare dashboard → R2 → create bucket (e.g. `gallery`).
2. Create an R2 API token (Object Read & Write), copy the access key pair.
3. Add a CORS rule on the bucket allowing `PUT`/`GET` from the admin + gallery
   origins (needed for direct browser uploads via presigned URLs).
