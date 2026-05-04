import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { downloadJobs, approvals } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { logger } from "../lib/logger.js";

const downloads = new Hono();
downloads.use("*", authMiddleware);

downloads.post("/", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const personId = body?.personId;

  if (!personId || typeof personId !== "string") {
    return sendError(c, 400, "INVALID_REQUEST", "personId is required");
  }

  const db = getDb();

  const approval = db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.userId, user.id),
        eq(approvals.personId, personId),
      ),
    )
    .limit(1)
    .all()[0];

  if (!approval || approval.revokedAt) {
    return sendError(c, 403, "FORBIDDEN", "No access to this person's assets");
  }

  const existingPending = db
    .select()
    .from(downloadJobs)
    .where(
      and(
        eq(downloadJobs.userId, user.id),
        eq(downloadJobs.personId, personId),
        eq(downloadJobs.status, "pending"),
      ),
    )
    .all();

  if (existingPending.length > 0) {
    return sendSuccess(c, { data: existingPending[0] });
  }

  const job = {
    id: randomUUID(),
    userId: user.id,
    personId,
    status: "pending" as const,
    zipPath: null,
    expiresAt: null,
    error: null,
    createdAt: new Date(),
  };

  db.insert(downloadJobs).values(job).run();

  logger.info(
    { jobId: job.id, userId: user.id, personId },
    "download job created",
  );

  return sendSuccess(c, { data: job }, 201);
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

  if (!job) {
    return sendError(c, 404, "NOT_FOUND", "Download job not found");
  }

  if (job.userId !== user.id && user.role !== "admin") {
    return sendError(c, 403, "FORBIDDEN", "Not your download job");
  }

  return sendSuccess(c, { data: job });
});

export { downloads };
