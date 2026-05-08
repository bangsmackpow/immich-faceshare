# FaceShare — Project Memory

## Architecture
- **Monorepo**: `apps/api` (Hono), `apps/web` (React+Vite), `packages/shared` (types)
- **Single container**: API + frontend bundled into one Docker image
- **Auth**: better-auth with email/password, no OAuth
- **DB**: SQLite via Drizzle ORM (WAL mode, 64MB cache, 256MB mmap)
- **Deployment**: GHCR images, Portainer webhook, `pull_policy: always`

## Key Endpoints
- `GET /api/people` — List people with `thumbnailUrl: /api/people/:id/thumbnail`
- `GET /api/people/:id/thumbnail` — Proxy to Immich `/api/people/:id/thumbnail`
- `GET /api/assets/:personId` — List assets (requires approval)
- `GET /api/assets/proxy/:assetId?token=` — Proxy signed asset access
- `GET /api/admin/status` — System health report
- `GET /health` — Docker healthcheck

## Auth Flow
- Admin creates accounts via `/admin` dashboard
- Sessions use `better-auth` with secure cookies
- `trustedOrigins` includes `FRONTEND_URL` for HTTPS/reverse proxy
- Password hashing via `@better-auth/utils/password`

## Thumbnail Flow
1. People list returns `thumbnailUrl: /api/people/:id/thumbnail`
2. Browser requests endpoint
3. API proxies to Immich `/api/people/:id/thumbnail` with API key
4. Returns JPEG with `Cache-Control: public, max-age=86400`

## Deployment
- Single `faceshare` service in `docker-compose.yml`
- Must attach to Immich network (`immich_default`) for hostname resolution
- CI publishes `ghcr.io/bangsmackpow/immich-faceshare:latest` + commit SHA
- Portainer webhook triggers auto-deploy

## Current State (2026-05-08)
- Auth: email/password working, session persistence verified
- Thumbnails: proxied via Immich API (fixed from broken filesystem paths)
- Admin routing: "Back to app" goes to `/people` (fixed from `/login`)
- Next: test downloads, verify HTTPS cookie flags
