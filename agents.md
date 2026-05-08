# FaceShare — Agent Context

## Project Overview
FaceShare is a face discovery and sharing app for Immich. Single Docker container with Hono API + React frontend. Email/password auth via better-auth. SQLite via Drizzle.

## Tech Stack
- **API**: Hono, better-auth, better-sqlite3, drizzle-orm, pino
- **Web**: React, Vite, Tailwind, React Router, TanStack Query
- **Shared**: TypeScript, zod validation
- **Deploy**: Docker Compose, GHCR, Portainer

## Key Patterns
- Auth middleware uses `getAuth().api.getSession()` (tokens are hashed before DB storage)
- Thumbnails proxied via `/api/people/:id/thumbnail` → Immich API
- Assets accessed via signed URLs (`/api/assets/proxy/:id?token=`)
- All config via environment variables
- No OAuth, no public registration

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
