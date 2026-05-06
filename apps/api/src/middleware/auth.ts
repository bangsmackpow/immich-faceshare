import { createMiddleware } from "hono/factory";
import { getAuth } from "../auth/better-auth.js";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { sendError } from "../lib/response.js";
import { logger } from "../lib/logger.js";
import type { AuthUser } from "../auth/better-auth.js";

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export type { AuthUser };

function parseCookie(header: string | null): Record<string, string> {
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
  const cookies = parseCookie(cookieHeader);
  const token =
    c.req.header("authorization")?.replace("Bearer ", "") ??
    cookies["faceshare.session_token"];

  if (!token) {
    return sendError(c, 401, "UNAUTHORIZED", "No session token provided");
  }

  try {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return sendError(c, 401, "UNAUTHORIZED", "Invalid or expired session");
    }

    const db = getDb();
    const dbUser = db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
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
