import { Hono } from "hono";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { people, approvals } from "../db/schema.js";
import { searchPeopleFts } from "../lib/sync.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

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
    .where(and(eq(approvals.userId, user.id), isNull(approvals.revokedAt)))
    .all()
    .map((a: { personId: string }) => a.personId);

  const enriched = results.map((p: Record<string, unknown>) => ({
    ...p,
    thumbnailUrl: p.id ? `/api/people/${p.id}/thumbnail` : null,
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

peopleRoute.get("/:id/thumbnail", async (c) => {
  const id = c.req.param("id");
  const db = getDb();

  const person = db
    .select()
    .from(people)
    .where(eq(people.id, id))
    .limit(1)
    .all()[0];

  if (!person?.immichPersonId) {
    return sendError(c, 404, "NOT_FOUND", "Person not found");
  }

  try {
    const baseUrl = process.env.IMMICH_URL?.replace(/\/+$/, "");
    const apiKey = process.env.IMMICH_API_KEY;
    if (!baseUrl || !apiKey) {
      return sendError(c, 500, "CONFIG_ERROR", "Immich not configured");
    }

    const res = await fetch(
      `${baseUrl}/api/people/${encodeURIComponent(person.immichPersonId as string)}/thumbnail`,
      {
        headers: { "x-api-key": apiKey },
      },
    );

    if (!res.ok) {
      throw new Error(`Immich returned ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    return c.newResponse(buffer, 200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    });
  } catch (err) {
    logger.warn({ personId: id, err: (err as Error).message }, "thumbnail proxy failed");
    return sendError(c, 502, "PROXY_FAILED", "Failed to fetch thumbnail");
  }
});

export { peopleRoute };
