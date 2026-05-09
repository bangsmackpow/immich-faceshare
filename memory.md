# FaceShare — Project Memory

## Architecture
- **Monorepo**: `apps/api` (Hono), `apps/web` (React+Vite), `packages/shared` (types)
- **Single container**: API + frontend bundled into one Docker image
- **Auth**: better-auth with email/password, no OAuth
- **DB**: SQLite via Drizzle ORM (WAL mode, 64MB cache, 256MB mmap)
- **Deployment**: GHCR images, Portainer webhook, `pull_policy: always`

## Key Endpoints
- `GET /api/people` — List people with `thumbnailUrl: /api/people/:id/thumbnail`, `hasAccess` filtered by `isNull(revokedAt)`
- `GET /api/people/:id/thumbnail` — Proxy to Immich `/api/people/:id/thumbnail`
- `GET /api/assets/:personId` — List assets (requires approval)
- `GET /api/assets/proxy/:assetId?token=` — Proxy signed asset access
- `POST /api/downloads` — Enqueue ZIP download job
- `GET /api/downloads` — List user's download jobs with status and signed URLs
- `GET /api/downloads/serve/:jobId?token=` — Serve completed ZIP (signed)
- `POST /api/share` — Create single-photo share link (authenticated)
- `GET /api/share/:code` — Get share info (public)
- `POST /api/share/:code/verify` — Verify access code, return signed token (public)
- `GET /api/share/:code/download?token=` — Serve full-res image (public, token-protected)
- `GET /api/admin/status` — System health report
- `GET /health` — Docker healthcheck

## Auth Flow
- Admin creates accounts via `/admin` dashboard
- Sessions use `better-auth` with secure cookies
- `trustedOrigins` includes `FRONTEND_URL` for HTTPS/reverse proxy
- Password hashing via `@better-auth/utils/password`
- Welcome email sent with login credentials + app overview

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

## Single Photo Share Flow
1. User clicks "Share" in gallery lightbox on a single photo
2. `POST /api/share` creates a `shared_links` record with unique `code` + 6-digit `accessCode`
3. Email sent to recipient with share URL and access code
4. Recipient visits `/share/:code`, enters access code
5. `POST /api/share/:code/verify` validates code, returns signed token
6. `GET /api/share/:code/download?token=` serves full-res JPEG from Immich
7. Share links expire after 7 days; access count tracked

## Deployment
- Single `faceshare` service in `docker-compose.yml`
- Must attach to Immich network (`immich_default`) for hostname resolution
- CI publishes `ghcr.io/bangsmackpow/immich-faceshare:latest` + commit SHA
- Portainer webhook triggers auto-deploy

## Current State (2026-05-09)
- Auth: email/password working, session persistence verified
- Thumbnails: proxied via Immich API
- Admin routing: "Back to app" goes to `/people`
- Immich v2.x: `searchAssetsByPerson` uses POST with JSON body + retry logic
- Downloads: `/downloads` page with job polling, signed ZIP download, header nav icon
- Email notifications: working for approvals, download completion, and share links
- Single photo share: working with access code verification + full-res download
- Revoked approvals: correctly filtered from people list via `isNull(approvals.revokedAt)`
- Admin create user: can grant access to people instantly with checkboxes
- Gallery: client-side EXIF filters (date, camera, location), refresh button for re-sync
- Backups: downloadable from admin dashboard via signed route
