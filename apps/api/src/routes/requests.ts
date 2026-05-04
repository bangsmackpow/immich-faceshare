import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/index.js";
import { accessRequests, approvals, people } from "../db/schema.js";
import { authMiddleware, adminGuard } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { logger } from "../lib/logger.js";
import { syncPerson } from "../lib/sync.js";

const requests = new Hono();
requests.use("*", authMiddleware);

requests.post("/", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const personId = body?.personId;

  if (!personId || typeof personId !== "string") {
    return sendError(c, 400, "INVALID_REQUEST", "personId is required");
  }

  const db = getDb();

  const person = db
    .select()
    .from(people)
    .where(eq(people.id, personId))
    .limit(1)
    .all()[0];

  if (!person) {
    return sendError(c, 404, "NOT_FOUND", "Person not found");
  }

  const existing = db
    .select()
    .from(accessRequests)
    .where(
      and(
        eq(accessRequests.userId, user.id),
        eq(accessRequests.personId, personId),
        eq(accessRequests.status, "pending"),
      ),
    )
    .limit(1)
    .all()[0];

  if (existing) {
    return sendError(c, 409, "DUPLICATE", "Pending request already exists");
  }

  db.insert(accessRequests)
    .values({
      id: randomUUID(),
      userId: user.id,
      personId,
      status: "pending",
      createdAt: new Date(),
    })
    .run();

  logger.info(
    { userId: user.id, personId, personName: person.name },
    "access request created",
  );

  return sendSuccess(c, { ok: true }, 201);
});

requests.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb();

  const baseQuery = db
    .select({
      id: accessRequests.id,
      userId: accessRequests.userId,
      personId: accessRequests.personId,
      status: accessRequests.status,
      createdAt: accessRequests.createdAt,
      reviewedAt: accessRequests.reviewedAt,
      reviewedBy: accessRequests.reviewedBy,
      personName: people.name,
    })
    .from(accessRequests)
    .leftJoin(people, eq(accessRequests.personId, people.id))
    .orderBy(desc(accessRequests.createdAt));

  const rows =
    user.role === "admin"
      ? baseQuery.all()
      : baseQuery.where(eq(accessRequests.userId, user.id)).all();

  return sendSuccess(c, { data: rows, total: rows.length });
});

requests.post("/:id/review", adminGuard, async (c) => {
  const admin = c.get("user");
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const status = body?.status;

  if (!status || (status !== "approved" && status !== "denied")) {
    return sendError(
      c,
      400,
      "INVALID_REQUEST",
      "status must be 'approved' or 'denied'",
    );
  }

  const db = getDb();
  const req = db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, id))
    .limit(1)
    .all()[0];

  if (!req) {
    return sendError(c, 404, "NOT_FOUND", "Access request not found");
  }

  if (req.status !== "pending") {
    return sendError(c, 409, "ALREADY_REVIEWED", "Request already reviewed");
  }

  const now = new Date();
  db.update(accessRequests)
    .set({ status, reviewedAt: now, reviewedBy: admin.id })
    .where(eq(accessRequests.id, id))
    .run();

  if (status === "approved") {
    db.insert(approvals)
      .values({
        id: randomUUID(),
        userId: req.userId,
        personId: req.personId,
        grantedAt: now,
      })
      .run();

    syncPerson(req.personId).catch((err) =>
      logger.error(err, "post-approval sync failed"),
    );

    logger.info(
      {
        requestId: id,
        userId: req.userId,
        personId: req.personId,
      },
      "access approved",
    );
  }

  return sendSuccess(c, { ok: true });
});

export { requests };
