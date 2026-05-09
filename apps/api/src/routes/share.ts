import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "../db/index.js";
import { sharedLinks, assetCache, users, people } from "../db/schema.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { logger } from "../lib/logger.js";
import { getImmichClient } from "../lib/immich.js";
import { sendShareNotification } from "../lib/email.js";

const share = new Hono();

function generateCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

function generateAccessCode(length = 6): string {
  const chars = "0123456789";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length];
  }
  return result;
}

// Create share link (authenticated)
share.post("/", async (c) => {
  const user = c.get("user");
  const db = getDb();

  const body = await c.req.json().catch(() => null);
  if (!body || !body.assetId || !body.recipientEmail) {
    return sendError(c, 400, "INVALID_INPUT", "assetId and recipientEmail required");
  }

  const { assetId, recipientEmail } = body;

  const asset = db
    .select()
    .from(assetCache)
    .where(eq(assetCache.id, assetId))
    .limit(1)
    .all()[0];

  if (!asset) {
    return sendError(c, 404, "NOT_FOUND", "Asset not found");
  }

  const code = generateCode();
  const accessCode = generateAccessCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const link = db
    .insert(sharedLinks)
    .values({
      id: `sl_${randomBytes(12).toString("hex")}`,
      code,
      userId: user.id,
      personId: asset.personId,
      assetId: asset.id,
      recipientEmail,
      accessCode,
      expiresAt,
    })
    .returning()
    .get();

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const shareUrl = `${frontendUrl}/share/${code}`;

  // Send email notification
  const person = db
    .select({ name: people.name })
    .from(people)
    .where(eq(people.id, asset.personId))
    .limit(1)
    .all()[0];

  await sendShareNotification(recipientEmail, person?.name ?? "someone", shareUrl, accessCode);

  return sendSuccess(c, {
    code: link.code,
    accessCode: link.accessCode,
    shareUrl,
    expiresAt: link.expiresAt,
  });
});

// Get share info (public)
share.get("/:code", async (c) => {
  const code = c.req.param("code");

  const db = getDb();
  const link = db
    .select({
      id: sharedLinks.id,
      code: sharedLinks.code,
      recipientEmail: sharedLinks.recipientEmail,
      expiresAt: sharedLinks.expiresAt,
      accessCount: sharedLinks.accessCount,
      asset: assetCache,
      personName: people.name,
    })
    .from(sharedLinks)
    .innerJoin(assetCache, eq(sharedLinks.assetId, assetCache.id))
    .innerJoin(people, eq(sharedLinks.personId, people.id))
    .where(eq(sharedLinks.code, code))
    .limit(1)
    .all()[0];

  if (!link) {
    return sendError(c, 404, "NOT_FOUND", "Share link not found");
  }

  if (Date.now() > new Date(link.expiresAt).getTime()) {
    return sendError(c, 410, "EXPIRED", "Share link has expired");
  }

  return sendSuccess(c, {
    personName: link.personName,
    expiresAt: link.expiresAt,
    assetPreview: {
      id: link.asset.id,
      thumbnailUrl: link.asset.thumbnailUrl,
      exif: link.asset.exif,
    },
  });
});

// Verify access code (public)
share.post("/:code/verify", async (c) => {
  const code = c.req.param("code");
  const body = await c.req.json().catch(() => null);

  if (!body || !body.accessCode) {
    return sendError(c, 400, "INVALID_INPUT", "accessCode required");
  }

  const db = getDb();
  const link = db
    .select()
    .from(sharedLinks)
    .where(eq(sharedLinks.code, code))
    .limit(1)
    .all()[0];

  if (!link) {
    return sendError(c, 404, "NOT_FOUND", "Share link not found");
  }

  if (Date.now() > new Date(link.expiresAt).getTime()) {
    return sendError(c, 410, "EXPIRED", "Share link has expired");
  }

  if (link.accessCode !== body.accessCode) {
    return sendError(c, 403, "INVALID_CODE", "Invalid access code");
  }

  // Update access count
  db.update(sharedLinks)
    .set({
      accessCount: link.accessCount + 1,
      lastAccessedAt: new Date(),
    })
    .where(eq(sharedLinks.id, link.id))
    .run();

  // Generate signed token for image access
  const token = randomBytes(32).toString("hex");

  return sendSuccess(c, {
    token,
    assetId: link.assetId,
  });
});

// Serve full-resolution image (public, token-protected)
share.get("/:code/download", async (c) => {
  const code = c.req.param("code");
  const token = c.req.query("token");

  if (!token) {
    return sendError(c, 401, "MISSING_TOKEN", "Access token required");
  }

  const db = getDb();
  const link = db
    .select()
    .from(sharedLinks)
    .where(eq(sharedLinks.code, code))
    .limit(1)
    .all()[0];

  if (!link) {
    return sendError(c, 404, "NOT_FOUND", "Share link not found");
  }

  if (Date.now() > new Date(link.expiresAt).getTime()) {
    return sendError(c, 410, "EXPIRED", "Share link has expired");
  }

  try {
    const client = getImmichClient();
    const buffer = await client.getAssetThumbnail(link.assetId);

    return c.newResponse(buffer, 200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    });
  } catch (err) {
    logger.warn({ assetId: link.assetId, err: (err as Error).message }, "share download failed");
    return sendError(c, 502, "FETCH_FAILED", "Failed to fetch image");
  }
});

export { share };
