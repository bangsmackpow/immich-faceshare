import { createMiddleware } from "hono/factory";
import { SignJWT, jwtVerify } from "jose";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { randomUUID } from "node:crypto";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  role: "admin" | "user";
}

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

const JWT_ALG = "HS256";
const SESSION_DURATION = "7d";

function getJwtSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is required");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(user: AuthUser): Promise<string> {
  return new SignJWT({ sub: user.id, role: user.role })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getJwtSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<{ sub: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: [JWT_ALG],
    });
    if (!payload.sub || !payload.role) return null;
    return { sub: payload.sub as string, role: payload.role as string };
  } catch {
    return null;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  let token: string | undefined;

  const header = c.req.header("authorization");
  if (header?.startsWith("Bearer ")) {
    token = header.slice(7);
  }

  if (!token) {
    const cookies = c.req.header("cookie") ?? "";
    const sessionCookie = cookies
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("session="))
      ?.split("=")[1];
    if (sessionCookie) {
      token = sessionCookie;
    }
  }

  if (!token) {
    return c.json({ code: "UNAUTHORIZED", message: "Missing auth token" }, 401);
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return c.json({ code: "UNAUTHORIZED", message: "Invalid or expired token" }, 401);
  }

  const db = getDb();
  const row = db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1)
    .all()[0];

  if (!row) {
    return c.json({ code: "UNAUTHORIZED", message: "User not found" }, 401);
  }

  c.set("user", {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar,
    role: row.role as "admin" | "user",
  });

  await next();
});

export const adminGuard = createMiddleware(async (c, next) => {
  const user = c.get("user");
  if (user.role !== "admin") {
    return c.json({ code: "FORBIDDEN", message: "Admin access required" }, 403);
  }
  await next();
});

interface GoogleTokenPayload {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

export async function verifyGoogleToken(
  idToken: string,
): Promise<GoogleTokenPayload> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is required");
  }

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token verification failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as Record<string, string>;

  if (data.aud !== clientId) {
    throw new Error("Token audience mismatch");
  }

  return {
    sub: data.sub ?? "",
    email: data.email ?? "",
    name: data.name ?? "",
    picture: data.picture ?? "",
  };
}

function isEmailAllowed(email: string): boolean {
  const allowedEmails = process.env.ALLOWED_EMAILS;
  const allowedDomains = process.env.ALLOWED_DOMAINS;
  if (!allowedEmails && !allowedDomains) return true;
  if (allowedEmails) {
    const emails = allowedEmails.split(",").map((e) => e.trim().toLowerCase());
    if (emails.includes(email.toLowerCase())) return true;
  }
  if (allowedDomains) {
    const domains = allowedDomains.split(",").map((d) => d.trim().toLowerCase());
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && domains.includes(domain)) return true;
  }
  return false;
}

export async function findOrCreateUser(payload: GoogleTokenPayload) {
  const db = getDb();
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!isEmailAllowed(payload.email)) {
    throw new Error("Access denied: your email is not on the allowed list");
  }

  const existing = db
    .select()
    .from(users)
    .where(eq(users.googleId, payload.sub))
    .limit(1)
    .all()[0];

  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      avatar: existing.avatar,
      role: existing.role as "admin" | "user",
    } satisfies AuthUser;
  }

  const role =
    payload.email === adminEmail ? ("admin" as const) : ("user" as const);

  const newUser = {
    id: randomUUID(),
    email: payload.email,
    name: payload.name,
    googleId: payload.sub,
    avatar: payload.picture || null,
    role,
    createdAt: new Date(),
  };

  db.insert(users).values(newUser).run();
  logger.info({ email: newUser.email, role: newUser.role }, "user created");

  return {
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
    avatar: newUser.avatar,
    role: newUser.role,
  } satisfies AuthUser;
}
