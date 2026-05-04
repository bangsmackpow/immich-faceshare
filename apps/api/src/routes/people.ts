import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { people, approvals } from "../db/schema.js";
import { searchPeopleFts } from "../lib/sync.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { authMiddleware } from "../middleware/auth.js";

const peopleRoute = new Hono();
peopleRoute.use("*", authMiddleware);

peopleRoute.get("/", async (c) => {
  const q = c.req.query("q");
  const user = c.get("user");

  const results = q?.trim()
    ? searchPeopleFts(q.trim())
    : getDb().select().from(people).all();

  const db = getDb();
  const approvedIds = db
    .select({ personId: approvals.personId })
    .from(approvals)
    .where(eq(approvals.userId, user.id))
    .all()
    .map((a: { personId: string }) => a.personId);

  const enriched = results.map((p: Record<string, unknown>) => ({
    ...p,
    hasAccess: approvedIds.includes(p.id as string),
  }));

  return sendSuccess(c, { data: enriched, total: enriched.length });
});

peopleRoute.get("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");

  const person = db
    .select()
    .from(people)
    .where(eq(people.id, id))
    .limit(1)
    .all()[0];

  if (!person) {
    return sendError(c, 404, "NOT_FOUND", "Person not found");
  }

  const user = c.get("user");
  const approval = db
    .select()
    .from(approvals)
    .where(
      and(eq(approvals.userId, user.id), eq(approvals.personId, person.id)),
    )
    .limit(1)
    .all()[0];

  return sendSuccess(c, {
    data: { ...person, hasAccess: !!approval && !approval.revokedAt },
  });
});

export { peopleRoute };
