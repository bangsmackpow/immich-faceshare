import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { assetCache, approvals } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../lib/response.js";

const assets = new Hono();
assets.use("*", authMiddleware);

assets.get("/:personId", async (c) => {
  const user = c.get("user");
  const personId = c.req.param("personId");
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

  const result = db
    .select()
    .from(assetCache)
    .where(eq(assetCache.personId, personId))
    .all();

  return sendSuccess(c, { data: result, total: result.length });
});

export { assets };
