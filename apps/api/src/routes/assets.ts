import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { assetCache, approvals } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { createSignedAssetUrl, verifyToken } from "../lib/signing.js";
import { logger } from "../lib/logger.js";

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
      and(eq(approvals.userId, user.id), eq(approvals.personId, personId)),
    )
    .limit(1)
    .all()[0];

  if (!approval || approval.revokedAt) {
    return sendError(c, 403, "FORBIDDEN", "No access to this person's assets");
  }

  const rows = db
    .select()
    .from(assetCache)
    .where(eq(assetCache.personId, personId))
    .all();

  const withUrls = rows.map((a) => ({
    ...a,
    signedUrl: createSignedAssetUrl(a.immichAssetId),
  }));

  return sendSuccess(c, { data: withUrls, total: withUrls.length });
});

assets.get("/proxy/:assetId", async (c) => {
  const user = c.get("user");
  const assetId = c.req.param("assetId");
  const token = c.req.query("token");

  if (!token) {
    return sendError(c, 401, "MISSING_TOKEN", "Signed token required");
  }

  const payload = verifyToken(token);
  if (!payload || payload.resource !== `asset:${assetId}`) {
    return sendError(c, 403, "INVALID_TOKEN", "Invalid or expired token");
  }

  const db = getDb();
  const cached = db
    .select()
    .from(assetCache)
    .where(eq(assetCache.immichAssetId, assetId))
    .limit(1)
    .all()[0];

  if (!cached) {
    return sendError(c, 404, "NOT_FOUND", "Asset not found in cache");
  }

  const baseUrl = process.env.IMMICH_URL?.replace(/\/+$/, "");
  const apiKey = process.env.IMMICH_API_KEY;
  if (!baseUrl || !apiKey) {
    return sendError(c, 500, "CONFIG_ERROR", "Immich not configured");
  }

  try {
    const res = await fetch(
      `${baseUrl}/api/assets/${assetId}/thumbnail?format=JPEG`,
      {
        headers: { "x-api-key": apiKey },
      },
    );

    if (!res.ok) {
      throw new Error(`Immich proxy returned ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    const contentType =
      res.headers.get("content-type") ?? "image/jpeg";

    return c.newResponse(buffer, 200, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    });
  } catch (err) {
    logger.warn({ assetId, err: (err as Error).message }, "proxy fallback failed");
    return sendError(c, 502, "PROXY_FAILED", "Failed to fetch thumbnail");
  }
});

export { assets };
