import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createReadStream, existsSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { getDb } from "../db/index.js";
import { downloadJobs, approvals, assetCache, people } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { logger } from "../lib/logger.js";
import { enqueueDownload, serveDownload } from "../lib/download-queue.js";
import { createSignedDownloadUrl, verifyToken } from "../lib/signing.js";

const RATE_LIMIT_WINDOW = 10_000;
const rateLimitMap = new Map<string, number>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(userId);
  if (last && now - last < RATE_LIMIT_WINDOW) return false;
  rateLimitMap.set(userId, now);
  return true;
}

const downloads = new Hono();
downloads.use("*", authMiddleware);

downloads.post("/", async (c) => {
  const user = c.get("user");
  if (!checkRateLimit(user.id)) {
    return sendError(c, 429, "RATE_LIMITED", "Too many requests");
  }

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const personId = body?.personId;
  const assetIds = body?.assetIds as string[] | undefined;

  if (!personId || typeof personId !== "string") {
    return sendError(c, 400, "INVALID_REQUEST", "personId is required");
  }

  const db = getDb();
  const approval = db
    .select()
    .from(approvals)
    .where(and(eq(approvals.userId, user.id), eq(approvals.personId, personId)))
    .limit(1)
    .all()[0];

  if (!approval || approval.revokedAt) {
    return sendError(c, 403, "FORBIDDEN", "No access to this person's assets");
  }

  const ids =
    Array.isArray(assetIds) && assetIds.length > 0
      ? assetIds.slice(0, 100)
      : db
          .select({ id: assetCache.immichAssetId })
          .from(assetCache)
          .where(eq(assetCache.personId, personId))
          .all()
          .map((a) => a.id);

  if (ids.length === 0) {
    return sendError(c, 404, "NO_ASSETS", "No assets to download");
  }

  const jobId = enqueueDownload(user.id, personId, ids, user.email);
  return sendSuccess(c, { data: { id: jobId, status: "pending" } }, 201);
});

downloads.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb();

  const jobs = db
    .select()
    .from(downloadJobs)
    .where(eq(downloadJobs.userId, user.id))
    .orderBy(downloadJobs.createdAt)
    .all();

  const results = jobs.map((job) => {
    const result: Record<string, unknown> = {
      id: job.id,
      status: job.status,
      personId: job.personId,
      error: job.error,
      createdAt: job.createdAt,
    };

    if (job.status === "completed" && job.zipPath && job.expiresAt) {
      try {
        const s = existsSync(job.zipPath) ? statSync(job.zipPath) : null;
        if (s) {
          result.sizeBytes = s.size;
          result.downloadUrl = createSignedDownloadUrl(job.id);
          result.expiresAt = job.expiresAt;
        } else {
          result.status = "failed";
          result.error = "File deleted";
        }
      } catch {
        result.status = "failed";
        result.error = "File not found";
      }
    }

    return result;
  });

  return sendSuccess(c, { data: results });
});

downloads.get("/:jobId", async (c) => {
  const user = c.get("user");
  const jobId = c.req.param("jobId");
  const db = getDb();

  const job = db
    .select()
    .from(downloadJobs)
    .where(eq(downloadJobs.id, jobId))
    .limit(1)
    .all()[0];

  if (!job) return sendError(c, 404, "NOT_FOUND", "Download job not found");
  if (job.userId !== user.id && user.role !== "admin") {
    return sendError(c, 403, "FORBIDDEN", "Not your download job");
  }

  const result: Record<string, unknown> = {
    id: job.id,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
  };

  if (job.status === "completed" && job.zipPath) {
    try {
      const s = await stat(job.zipPath);
      result.sizeBytes = s.size;
      result.downloadUrl = createSignedDownloadUrl(job.id);
      result.expiresAt = job.expiresAt;
    } catch {
      result.status = "failed";
      result.error = "File not found on disk";
    }
  }

  return sendSuccess(c, { data: result });
});

downloads.get("/serve/:jobId", async (c) => {
  const token = c.req.query("token");
  const jobId = c.req.param("jobId");

  if (!token) {
    return sendError(c, 401, "MISSING_TOKEN", "Signed token required");
  }

  const payload = verifyToken(token);
  if (!payload || payload.resource !== `download:${jobId}`) {
    return sendError(c, 403, "INVALID_TOKEN", "Invalid or expired token");
  }

  const result = serveDownload(jobId);
  if (!result || !existsSync(result.path)) {
    return sendError(c, 404, "NOT_FOUND", "Download expired or not found");
  }

  const stream = createReadStream(result.path);

  return c.newResponse(stream as any, 200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="faceshare-${jobId.slice(0, 8)}.zip"`,
    "Cache-Control": "private, max-age=3600",
  });
});

export { downloads };
