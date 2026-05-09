# FaceShare — Agent Context

## Project Overview
FaceShare is a face discovery and sharing app for Immich. Single Docker container with Hono API + React frontend. Email/password auth via better-auth. SQLite via Drizzle.

## Tech Stack
- **API**: Hono, better-auth, better-sqlite3, drizzle-orm, pino, archiver
- **Web**: React, Vite, Tailwind, React Router, TanStack Query
- **Shared**: TypeScript, zod validation
- **Deploy**: Docker Compose, GHCR, Portainer

## Key Patterns
- Auth middleware uses `getAuth().api.getSession()` (tokens are hashed before DB storage)
- Thumbnails proxied via `/api/people/:id/thumbnail` → Immich API
- Assets accessed via signed URLs (`/api/assets/proxy/:id?token=`)
- Immich v2.x search uses POST `/api/search/metadata` with JSON body (not GET query params)
- Download queue is in-memory with SQLite job tracking; ZIPs stored in `/data/downloads`
- Single-photo sharing uses a unique `code` (URL) + 6-digit `accessCode` (verification)
- Public share routes bypass `authMiddleware`; frontend uses `publicApi` helper to prevent 401 redirects
- All config via environment variables
- No OAuth, no public registration

## Routes
- `/login` — Email/password login
- `/people` — Directory of Immich people, request access
- `/gallery/:personId` — Approved person's photos, select/download, share single photo
- `/downloads` — Download job status, polling, signed ZIP download
- `/share/:code` — Public share page (access code verification + full-res image)
- `/admin` — Admin dashboard (users, requests, approvals, backups, health, logs)

## API Endpoints
- `GET /api/people` — List people with `hasAccess` (filters revoked approvals via `isNull(revokedAt)`)
- `GET /api/people/:id` — Single person detail with `hasAccess`
- `GET /api/people/:id/thumbnail` — Proxy to Immich thumbnail
- `GET /api/assets/:personId` — List assets (requires approval)
- `GET /api/assets/proxy/:assetId?token=` — Proxy signed asset access
- `POST /api/assets/:personId/resync` — Re-sync assets from Immich for EXIF backfill
- `POST /api/downloads` — Enqueue ZIP download job
- `GET /api/downloads` — List user's download jobs
- `GET /api/downloads/serve/:jobId?token=` — Serve completed ZIP (signed)
- `POST /api/share` — Create single-photo share link (authenticated)
- `GET /api/share/:code` — Get share info (public)
- `POST /api/share/:code/verify` — Verify access code (public)
- `GET /api/share/:code/download?token=` — Serve full-res image (public, token-protected)
- `GET /api/admin/status` — System health report
- `GET /health` — Basic liveness check

## Assets
- Favicon/logo in `apps/web/public/` (SVG + PNG + ICO + webmanifest)
- Source logo: `logo.svg` (minimalist face with share arcs, B&W)

## Common Tasks
- **Add user**: Admin dashboard → User Management → Create User (optionally grant access to people instantly)
- **Backup**: Admin dashboard → Database Backups, or `docker compose exec faceshare cp /data/faceshare.db /data/backups/`
- **Update**: `docker compose pull && docker compose up -d`
- **Logs**: `docker compose logs -f faceshare`

## Gotchas
- `IMMICH_URL` must be reachable from container (use container name if same network)
- `FRONTEND_URL` must match browser URL for cookies to work
- `BETTER_AUTH_SECRET` and `SIGNING_SECRET` must be different random strings
- Container needs `immich_default` network to resolve `immich_server` hostname
- Immich v2.x requires POST for `/api/search/metadata` — GET returns 404
- Revoked approvals are filtered with `isNull(approvals.revokedAt)` — do not remove this check
- Share links expire after 7 days; access codes are 6-digit numeric
