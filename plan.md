# FaceShare — Implementation Plan

## Phase 1: Auth Migration (Complete)
- [x] Remove `bcrypt`/`@types/bcrypt`
- [x] Switch admin creation to `auth.api.signUpEmail()`
- [x] Secure password reset response
- [x] Push to main

## Phase 2: Docker & Session Fixes (Complete)
- [x] Simplify `migrate.ts` (remove OAuth migration)
- [x] Fix `trustedOrigins` type guard/fallback
- [x] Add frontend 401 auto-redirect
- [x] Document Docker network in compose
- [x] Add `pull_policy: always`
- [x] Push to main

## Phase 3: Cleanup & Security (Complete)
- [x] Schema cleanup, add `idx_accounts_user_id` index
- [x] Remove `googleId` from shared types
- [x] Remove unused zod schemas
- [x] Replace `<a href>` with `<NavLink>` in admin layout
- [x] Rename `SESSION_SECRET` to `SIGNING_SECRET`
- [x] Update `.env.example`
- [x] Push to main

## Phase 4: Middleware & Session Persistence (Complete)
- [x] Rewrite `authMiddleware` to use `getAuth().api.getSession()`
- [x] Inject `origin`/`referer` headers to bypass origin checks
- [x] Verify login, session persistence, admin navigation
- [x] Confirm Immich connectivity via `immich_default` network

## Phase 5: UI & Routing Fixes (Complete)
- [x] Proxy person thumbnails via Immich API endpoint
- [x] Fix "Back to app" routing from `/login` to `/people`
- [x] Update all documentation (README, setup, architecture, memory)
- [x] Push to main

## Phase 6: Immich v2.x API Compatibility (Complete)
- [x] Fix `searchAssetsByPerson` — Immich v2.x requires POST with JSON body
- [x] Add retry logic with exponential backoff
- [x] Test photo loading for approved persons end-to-end
- [x] Push to main

## Phase 7: Downloads UI (Complete)
- [x] Add `GET /api/downloads` endpoint listing user's download jobs
- [x] Create `/downloads` page with job status polling (3s auto-refresh)
- [x] Add download icon to header navigation
- [x] Signed ZIP download with expiration
- [x] Push to main

## Pending
- [ ] Verify HTTPS cookie flags (`__Secure-`) in production
- [ ] Add rate limiting
- [ ] Add CSRF protection
- [ ] Plan PostgreSQL migration path
