import { createMiddleware } from "hono/factory";
import { sendError } from "../lib/response.js";
import { logger } from "../lib/logger.js";
import { getAuth } from "../auth/better-auth.js";
import type { AuthUser } from "../auth/better-auth.js";

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export type { AuthUser };

export const authMiddleware = createMiddleware(async (c, next) => {
  try {
    // Clone the request and inject origin so better-auth's origin check passes
    const origin =
      process.env.BETTER_AUTH_URL ??
      process.env.FRONTEND_URL ??
      "http://localhost:3001";

    const headers = new Headers(c.req.raw.headers);
    if (!headers.has("origin")) {
      headers.set("origin", origin);
    }
    if (!headers.has("referer")) {
      headers.set("referer", origin);
    }

    const forwardedReq = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers,
      body: c.req.raw.body,
    });

    const session = await getAuth().api.getSession(forwardedReq);

    if (!session?.user) {
      logger.warn(
        { method: c.req.method, path: c.req.path },
        "session not found or expired",
      );
      return sendError(c, 401, "UNAUTHORIZED", "Invalid or expired session");
    }

    c.set("user", {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatar: session.user.image ?? null,
      role: (session.user.role as "admin" | "user") ?? "user",
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
