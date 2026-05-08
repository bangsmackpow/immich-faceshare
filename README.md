# FaceShare

Face discovery and sharing for Immich. Automatically finds faces in your Immich library, groups them by person, and provides a web UI for viewing, sharing, and managing access.

## Quick Start

```bash
# clone the repo
git clone https://github.com/bangsmackpow/immich-faceshare.git
cd immich-faceshare

# configure
cp .env.example .env
# edit .env with your Immich URL, API key, and admin credentials

# start
docker compose up -d
```

The service runs on `http://localhost:3001` by default.

## Features

- **Face Discovery** — Automatically pulls people from your Immich library
- **Photo Sharing** — Users request access to specific people, admins approve/deny
- **Email/Password Auth** — Admin creates accounts, no OAuth or third-party providers
- **Email Notifications** — Users notified when access is approved or downloads are ready
- **Downloads Page** — `/downloads` shows queued, processing, and completed ZIP downloads with auto-refresh
- **Bulk Downloads** — Queue-based ZIP download for approved photos
- **Admin Dashboard** — Manage users, requests, approvals, audit logs, DB backups, and system health
- **Docker-Ready** — Single compose file, pre-built images on GHCR

## Authentication

FaceShare uses **email/password authentication** powered by [better-auth](https://www.better-auth.com/). There is no public registration — an admin creates all user accounts.

### First-Time Setup

1. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your `.env` before starting the container
2. On first boot, the admin account is created automatically
3. Sign in at `http://localhost:3001/login` with the admin credentials
4. Create additional user accounts from the admin dashboard

### Password Requirements

- Minimum 8 characters
- Admin can reset any user's password from the dashboard

## Admin Dashboard

Visit `/admin` to access the admin panel (requires admin role):

| Panel | Description |
|---|---|
| **System Health** | Real-time status for database, Immich, memory, uptime, and queue depth |
| **User Management** | Create, edit, reset passwords, and delete user accounts |
| **Database Backups** | Create, list, and restore timestamped database backups |
| **Pending Requests** | Approve or deny user access requests |
| **Active Approvals** | View and revoke existing access grants |
| **Audit Log** | View recent system activity and admin actions |

## Downloads

Users can download approved photos as ZIP archives from two places:

1. **Gallery page** (`/gallery/:personId`) — Click "All" for all photos, or select individual photos and click "Download (N)"
2. **Downloads page** (`/downloads`) — View all your download jobs with status (pending → processing → completed), file size, and a download button for completed ZIPs

Completed downloads auto-refresh every 3 seconds. ZIP files expire after 24 hours.

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Description | Default |
|---|---|---|
| `IMMICH_API_KEY` | Immich API key (required) | — |
| `IMMICH_URL` | Immich server URL | `http://immich:2283` |
| `FRONTEND_URL` | Public URL for cookie domain and trusted origins | `http://localhost:3001` |
| `BETTER_AUTH_SECRET` | Secret for session token signing (required) | — |
| `BETTER_AUTH_URL` | Public URL of your instance | `http://localhost:3001` |
| `SIGNING_SECRET` | Secret for signing download/asset URLs | `change-me-to-a-random-secret` |
| `DATABASE_PATH` | SQLite database path | `/data/faceshare.db` |
| `BACKUP_DIR` | Database backup directory | `/data/backups` |
| `LOG_DIR` | Log output directory | `/data/logs` |
| `LOG_LEVEL` | Log level | `info` |
| `LOG_TO_FILE` | Write logs to file (`true`/`false`) | `true` |
| `DOWNLOADS_DIR` | ZIP download working directory | `/data/downloads` |
| `PORT` | HTTP listen port | `3001` |
| `NODE_ENV` | Environment mode | `production` |
| `ADMIN_EMAIL` | Admin account email (created on first boot) | — |
| `ADMIN_PASSWORD` | Admin account password (created on first boot) | — |
| `ADMIN_NAME` | Admin display name | `Administrator` |

### Email Notifications (Optional)

| Variable | Description |
|---|---|
| `SMTP_HOST` | SMTP server for email notifications |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for emails |

## Docker Images

Pre-built images are available on GitHub Container Registry:

```
ghcr.io/bangsmackpow/immich-faceshare:latest
```

Each commit to `main` publishes a new image tagged with the commit SHA and `latest`.

### Building locally

```bash
docker compose up -d --build
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

## Database Management

### Backups

Backups are stored in `/data/backups` (configurable via `BACKUP_DIR`). You can create and restore backups via the admin dashboard, or manually:

```bash
# Manual backup (inside container)
docker compose exec faceshare cp /data/faceshare.db /data/backups/faceshare-$(date +%F).db

# List backups
docker compose exec faceshare ls -lh /data/backups/

# Restore (requires container restart)
docker compose exec faceshare cp /data/backups/faceshare-YYYY-MM-DD.db /data/faceshare.db
docker compose restart faceshare
```

### Health Checks

- `GET /api/admin/status` — Full system health report
- `GET /health` — Basic liveness check (used by Docker healthcheck)
- WAL integrity verified via `PRAGMA quick_check`

## Production Architecture

For scaling recommendations, caching strategies, rate limiting, CDN setup, and deployment topologies, see [docs/production-architecture.md](docs/production-architecture.md).

Key recommendations for production:
- Add Redis for caching, rate limiting, and queue management
- Migrate to PostgreSQL at 5K+ users
- Use presigned URLs for photo delivery instead of API proxy
- Add OpenTelemetry for observability
- Implement automated backup rotation and off-site replication

## Deployment

The CI pipeline (`.github/workflows/deploy.yml`) runs on every push to `main`:

1. TypeScript type-checking and linting
2. Full build
3. Docker image build and push to `ghcr.io`
4. Optional Portainer webhook trigger for auto-deploy
