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
- All config via environment variables
- No OAuth, no public registration

## Routes
- `/login` — Email/password login
- `/people` — Directory of Immich people, request access
- `/gallery/:personId` — Approved person's photos, select/download
- `/downloads` — Download job status, polling, signed ZIP download
- `/admin` — Admin dashboard (users, requests, backups, health, logs)

## Common Tasks
- **Add user**: Admin dashboard → User Management → Create User
- **Backup**: Admin dashboard → Database Backups, or `docker compose exec faceshare cp /data/faceshare.db /data/backups/`
- **Update**: `docker compose pull && docker compose up -d`
- **Logs**: `docker compose logs -f faceshare`

## Gotchas
- `IMMICH_URL` must be reachable from container (use container name if same network)
- `FRONTEND_URL` must match browser URL for cookies to work
- `BETTER_AUTH_SECRET` and `SIGNING_SECRET` must be different random strings
- Container needs `immich_default` network to resolve `immich_server` hostname
- Immich v2.x requires POST for `/api/search/metadata` — GET returns 404
