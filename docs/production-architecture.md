# FaceShare Production Architecture Recommendations

## Current State
- Single-node Docker Compose deployment
- SQLite (better-sqlite3) for application data
- Thumbnail proxy via Immich API (`/api/people/:id/thumbnail`)
- Hono.js API + React SPA frontend
- better-auth sessions with email/password authentication
- File-based logging with pino
- Immich v2.x compatible (POST `/api/search/metadata` with JSON body)
- Downloads page (`/downloads`) with job polling and signed ZIP delivery

## Scaling Recommendations

### 1. Database Layer

**Current:** SQLite WAL mode with 64MB cache, 256MB mmap
**For 10K+ users:**
- Migrate to PostgreSQL (single instance, then read replicas)
- Use connection pooling (PgBouncer)
- Add indexes on high-traffic queries:
  - `accessRequests(status, createdAt)`
  - `approvals(userId, personId)`
  - `auditLog(createdAt, action)`
  - `downloadJobs(status, createdAt)`
- Implement WAL archiving for point-in-time recovery
- Consider pgvector for face similarity search if expanding beyond Immich

**Migration path:** Drizzle supports both SQLite and PostgreSQL. Schema is already defined in TypeScript, so migration is mostly config + connection string change.

### 2. Caching Layer

**Add Redis for:**
- Session storage (Redis-backed better-auth sessions for distributed deployments)
- Rate limiting (sliding window counters)
- API response caching (Immich proxy responses, person lists)
- Download job queue state (replace in-memory array)
- Real-time notifications (Pub/Sub for approval status updates)

**Cache TTL recommendations:**
- Immich person list: 5 minutes
- Immich photo metadata: 15 minutes
- User session: 7 days (matches cookie Max-Age)
- Rate limit windows: 1 minute

### 3. API Rate Limiting

**Implement per-user/per-IP limits:**
- `/api/auth/*`: 10 req/min (prevent brute force)
- `/api/people`: 30 req/min
- `/api/people/:id/photos`: 60 req/min (photo-heavy)
- `/api/admin/*`: 120 req/min (admin operations)
- Global: 1000 req/min per IP

**Use Redis + sliding window algorithm** for accurate distributed rate limiting.

### 4. Asset Delivery

**Current:** Photos served through API proxy with signed URLs. Thumbnails proxied via `/api/people/:id/thumbnail` from Immich API.
**Recommended:**
- Generate presigned URLs from Immich for direct asset access
- Add CDN (CloudFlare, CloudFront) for cached photo delivery
- Implement thumbnail generation at multiple sizes (256px, 512px, 1024px)
- Use `Cache-Control: public, max-age=86400` for static assets
- Consider WebP/AVIF conversion for bandwidth savings

### 5. Download Queue

**Current:** In-memory array with SQLite job tracking. `/downloads` page polls every 3s. Signed ZIP URLs expire after 24h. Email notifications on completion.
**For production:**
- Move to Redis-backed queue (BullMQ or Upstash QStash)
- Add retry logic with exponential backoff
- Implement progress tracking (percent complete, ETA)
- Add concurrency limits (max 3 concurrent downloads per user)
- Store completed downloads in object storage (S3/R2) with presigned URLs
- Add cleanup job for expired downloads (24hr TTL)

### 6. Observability

**Add:**
- OpenTelemetry tracing (request → DB → Immich proxy)
- Metrics: request latency, error rates, queue depth, cache hit ratio
- Structured logging with correlation IDs
- Health check endpoints:
  - `/health` (basic: is process alive)
  - `/health/ready` (deep: DB connected, Immich reachable, disk space OK)
- Alerting on:
  - Error rate > 1% over 5 minutes
  - DB latency > 100ms p95
  - Disk usage > 80%
  - Queue depth > 100 pending jobs

### 7. Security Hardening

**Add:**
- CSRF protection for state-changing endpoints
- Content Security Policy headers
- HSTS with preload
- Request size limits (prevent large payload attacks)
- Input validation with Zod on all endpoints
- API key rotation for Immich integration
- Audit log integrity (hash chain or append-only table)
- Backup encryption (AES-256-GCM for DB backups)
- Account lockout after failed login attempts (brute force protection)
- Password hashing via `@better-auth/utils/password`

### 8. Deployment Architecture

**Small scale (1-10K users):**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CloudFlare│────▶│  Hono API   │────▶│  PostgreSQL │
│   CDN       │     │  (2 replicas)│     │  (1 primary)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                     ┌─────────────┐
                     │    Redis    │
                     │  (cache +   │
                     │   queue)    │
                     └─────────────┘
```

**Medium scale (10K-100K users):**
- Add horizontal API replicas behind load balancer
- PostgreSQL read replicas for query offloading
- Redis Cluster for distributed caching
- Object storage (S3/R2) for download artifacts
- Separate worker process for download queue

**Large scale (100K+ users):**
- Kubernetes deployment with HPA
- PostgreSQL with Citus for horizontal scaling
- CDN edge caching for photos
- Separate microservices: auth, photos, downloads, admin
- Event-driven architecture with Kafka/RabbitMQ

### 9. Backup Strategy

**Current:** Manual API-triggered file copy
**Recommended:**
- Automated daily backups (cron + pg_dump for Postgres)
- Weekly full backups + daily WAL archives
- Off-site replication (different region/cloud)
- Backup verification (automated restore test weekly)
- Retention policy: 7 daily, 4 weekly, 12 monthly
- Encryption at rest (AWS KMS, GCP KMS, or age encryption)

### 10. Graceful Shutdown

**Add:**
- SIGTERM handler to drain active requests
- Close DB connections cleanly
- Cancel in-progress downloads
- Flush log buffers
- Health check should return 503 during shutdown
- Kubernetes: `terminationGracePeriodSeconds: 30`

## Immediate Next Steps (Priority Order)

1. **Add indexes** to existing SQLite schema (5 min, immediate benefit)
2. **Implement rate limiting** with in-memory fallback (1-2 hours)
3. **Add presigned URL support** for photo delivery (2-4 hours)
4. **Move download queue to Redis** when Redis is added (4-8 hours)
5. **Add OpenTelemetry** for observability (4-8 hours)
6. **Plan PostgreSQL migration** when user count approaches 5K (1-2 weeks)

## Cost Estimates (AWS)

| Component | Small (1-10K) | Medium (10K-100K) | Large (100K+) |
|-----------|---------------|-------------------|---------------|
| Compute (ECS/Fargate) | $30/mo | $150/mo | $500+/mo |
| Database (RDS Postgres) | $25/mo | $100/mo | $400+/mo |
| Cache (ElastiCache) | - | $50/mo | $200+/mo |
| CDN (CloudFront) | $5/mo | $50/mo | $200+/mo |
| Storage (S3) | $2/mo | $20/mo | $100+/mo |
| **Total** | **~$62/mo** | **~$370/mo** | **~$1400+/mo** |
