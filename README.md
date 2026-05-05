# FaceShare

Face discovery and sharing for Immich. Automatically finds faces in your Immich library, groups them by person, and provides a web UI for viewing and sharing.

## Quick Start

```bash
# clone the repo
git clone https://github.com/bangsmackpow/immich-faceshare.git
cd immich-faceshare

# configure
cp .env.example .env
# edit .env with your Immich URL and API key

# start
docker compose up -d
```

The service runs on `http://localhost:3001` by default.

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Description | Default |
|---|---|---|
| `IMMICH_API_KEY` | Immich API key (required) | — |
| `IMMICH_URL` | Immich server URL | `http://immich:2283` |
| `SESSION_SECRET` | Session encryption secret | `change-me-to-a-random-secret` |
| `DATABASE_PATH` | SQLite database path | `/data/faceshare.db` |
| `PORT` | HTTP listen port | `3001` |
| `NODE_ENV` | Environment mode | `development` |

Optional features (Google OAuth, email):

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL |
| `SMTP_HOST` | SMTP server for email notifications |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for emails |
| `ADMIN_EMAIL` | Admin email for notifications |

## Docker Images

Pre-built images are available on GitHub Container Registry:

```
ghcr.io/bangsmackpow/immich-faceshare:latest
```

Each commit to `main` publishes a new image tagged with the commit SHA and `latest`.

### Building locally

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

## Development

```bash
# install dependencies
npm ci

# run all packages in dev mode (API + web)
npm run dev
```

The monorepo contains three packages:

| Package | Description |
|---|---|
| `apps/api` | Hono API server (port 3001) |
| `apps/web` | React + Vite frontend (port 5173) |
| `packages/shared` | Shared types and validation |

### Database

Uses SQLite via Drizzle ORM:

```bash
npm run db:generate  # generate migrations
npm run db:push      # push schema to database
```

## Deployment

The CI pipeline (`.github/workflows/deploy.yml`) runs on every push to `main`:

1. TypeScript type-checking and linting
2. Full build
3. Docker image build and push to `ghcr.io`
4. Optional Portainer webhook trigger for auto-deploy
