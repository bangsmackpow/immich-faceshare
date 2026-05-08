import { createMiddleware } from "hono/factory";
import { getDb } from "../db/index.js";
import { users, sessions as sessionsTable } from "../db/schema.js";
import { eq, gt } from "drizzle-orm";
import { sendError } from "../lib/response.js";
import { logger } from "../lib/logger.js";
import type { AuthUser } from "../auth/better-auth.js";

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export type { AuthUser };

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) cookies[key.trim()] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const cookieHeader = c.req.raw.headers.get("cookie");
  const authHeader = c.req.raw.headers.get("authorization");

  try {
    // Extract session token from cookie or auth header
    const cookies = parseCookies(cookieHeader);
    const sessionToken =
      cookies["__Secure-faceshare.session_token"] ??
      cookies["faceshare.session_token"] ??
      authHeader?.replace("Bearer ", "");

    if (!sessionToken) {
      logger.warn({ method: c.req.method, path: c.req.path }, "no session token");
      return sendError(c, 401, "UNAUTHORIZED", "Invalid or expired session");
    }

    // Validate session directly from database
    const db = getDb();
    const now = new Date();
    const session = db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, sessionToken))
      .get();

    if (!session || new Date(session.expiresAt) < now) {
      logger.warn({ method: c.req.method, path: c.req.path }, "session not found or expired");
      return sendError(c, 401, "UNAUTHORIZED", "Invalid or expired session");
    }

    // Get user from database
    const dbUser = db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .get();

    if (!dbUser) {
      return sendError(c, 401, "UNAUTHORIZED", "User not found");
    }

    c.set("user", {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      avatar: dbUser.image,
      role: dbUser.role as "admin" | "user",
    });

    await next();
  } catch (err) {
    logger.error(err, "auth middleware error");
    return sendError(c, 401, "UNAUTHORIZED", "Authentication failed");
  }
});

export const adminGuard = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return sendError(c, 403, "FORBIDDEN", "Admin access required");
  }
  await next();
});
