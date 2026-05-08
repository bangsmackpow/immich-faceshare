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
- `POST /api/downloads` — Enqueue ZIP download job
- `GET /api/downloads` — List user's download jobs with status and signed URLs
- `GET /api/downloads/serve/:jobId?token=` — Serve completed ZIP (signed)
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

## Immich v2.x API
- `/api/search/metadata` requires **POST** with JSON body (`{ personIds, type, page, size, order }`)
- GET with query params returns 404
- `searchAssetsByPerson` in `apps/api/src/lib/immich.ts` handles this with retry logic

## Download Flow
1. User clicks "All" or selects photos in gallery → `POST /api/downloads`
2. Job enqueued in SQLite, added to in-memory queue
3. Worker downloads assets from Immich, creates ZIP in `/data/downloads`
4. Email sent to user (if SMTP configured)
5. User visits `/downloads` → sees job with status and download button
6. Signed URL expires after 24 hours

## Deployment
- Single `faceshare` service in `docker-compose.yml`
- Must attach to Immich network (`immich_default`) for hostname resolution
- CI publishes `ghcr.io/bangsmackpow/immich-faceshare:latest` + commit SHA
- Portainer webhook triggers auto-deploy

## Current State (2026-05-08)
- Auth: email/password working, session persistence verified
- Thumbnails: proxied via Immich API (fixed from broken filesystem paths)
- Admin routing: "Back to app" goes to `/people` (fixed from `/login`)
- Immich v2.x: `searchAssetsByPerson` uses POST with JSON body + retry logic
- Downloads: `/downloads` page with job polling, signed ZIP download, header nav icon
- Email notifications: working for approvals and download completion
