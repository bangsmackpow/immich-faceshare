import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/index.js";
import {
  accessRequests,
  approvals as approvalsTable,
  auditLog,
  people,
  users,
} from "../db/schema.js";
import { authMiddleware, adminGuard } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { logger } from "../lib/logger.js";
import { sendApprovalNotification } from "../lib/email.js";

const admin = new Hono();
admin.use("*", authMiddleware, adminGuard);

// ── Pending requests queue ──
admin.get("/requests", (c) => {
  const db = getDb();
  const rows = db
    .select({
      id: accessRequests.id,
      status: accessRequests.status,
      createdAt: accessRequests.createdAt,
      reviewedAt: accessRequests.reviewedAt,
      personId: accessRequests.personId,
      personName: people.name,
      requesterId: users.id,
      requesterEmail: users.email,
      requesterName: users.name,
    })
    .from(accessRequests)
    .leftJoin(people, eq(accessRequests.personId, people.id))
    .leftJoin(users, eq(accessRequests.userId, users.id))
    .orderBy(desc(accessRequests.createdAt))
    .all();

  return sendSuccess(c, { data: rows, total: rows.length });
});

// ── Approvals list ──
admin.get("/approvals", (c) => {
  const db = getDb();
  const rows = db
    .select({
      id: approvalsTable.id,
      userId: approvalsTable.userId,
      personId: approvalsTable.personId,
      grantedAt: approvalsTable.grantedAt,
      revokedAt: approvalsTable.revokedAt,
      personName: people.name,
      userEmail: users.email,
      userName: users.name,
    })
    .from(approvalsTable)
    .leftJoin(people, eq(approvalsTable.personId, people.id))
    .leftJoin(users, eq(approvalsTable.userId, users.id))
    .orderBy(desc(approvalsTable.grantedAt))
    .all();

  return sendSuccess(c, { data: rows, total: rows.length });
});

// ── Revoke approval ──
admin.post("/approvals/:id/revoke", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const db = getDb();

  const approval = db
    .select()
    .from(approvalsTable)
    .where(eq(approvalsTable.id, id))
    .limit(1)
    .all()[0];

  if (!approval) {
    return sendError(c, 404, "NOT_FOUND", "Approval not found");
  }
  if (approval.revokedAt) {
    return sendError(c, 409, "ALREADY_REVOKED", "Already revoked");
  }

  const now = new Date();
  db.update(approvalsTable)
    .set({ revokedAt: now })
    .where(eq(approvalsTable.id, id))
    .run();

  db.insert(auditLog)
    .values({
      id: randomUUID(),
      userId: user.id,
      action: "approval.revoke",
      details: JSON.stringify({ approvalId: id, userId: approval.userId, personId: approval.personId }),
      ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
      createdAt: now,
    })
    .run();

  logger.info({ approvalId: id, adminId: user.id }, "approval revoked");
  return sendSuccess(c, { ok: true });
});

// ── Audit log ──
admin.get("/audit-log", (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);
  const actionFilter = c.req.query("action");

  const base = db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      action: auditLog.action,
      details: auditLog.details,
      ip: auditLog.ip,
      createdAt: auditLog.createdAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .orderBy(desc(auditLog.createdAt));

  const rows = actionFilter
    ? base.where(eq(auditLog.action, actionFilter)).limit(limit).all()
    : base.limit(limit).all();

  return sendSuccess(c, { data: rows, total: rows.length });
});

// ── API playground ──
const IMMICH_ENDPOINTS = [
  "/api/persons",
  "/api/server-info/version",
  "/api/server-info/ping",
  "/api/assets",
  "/api/search/assets",
  "/api/albums",
];

admin.get("/playground/endpoints", (c) => {
  return sendSuccess(c, { data: IMMICH_ENDPOINTS });
});

admin.post("/playground/execute", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const endpoint = body?.endpoint;

  if (!endpoint || typeof endpoint !== "string") {
    return sendError(c, 400, "INVALID_REQUEST", "endpoint is required");
  }

  const baseUrl = process.env.IMMICH_URL?.replace(/\/+$/, "");
  const apiKey = process.env.IMMICH_API_KEY;
  if (!baseUrl || !apiKey) {
    return sendError(c, 500, "CONFIG_ERROR", "Immich not configured");
  }

  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      headers: { "x-api-key": apiKey, accept: "application/json" },
    });
    const elapsed = Date.now() - start;
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch { /* not JSON */ }

    getDb()
      .insert(auditLog)
      .values({
        id: randomUUID(),
        userId: user.id,
        action: "playground.execute",
        details: JSON.stringify({ endpoint, status: res.status }),
        ip: null,
        createdAt: new Date(),
      })
      .run();

    return sendSuccess(c, {
      data: {
        status: res.status,
        statusText: res.statusText,
        elapsed,
        headers: Object.fromEntries(res.headers.entries()),
        body: parsed,
      },
    });
  } catch (err) {
    return sendError(c, 502, "PROXY_ERROR", (err as Error).message);
  }
});

// ── Logs tail ──
const LOG_PATH = () => {
  const dir = process.env.LOG_DIR ?? join(process.cwd(), "logs");
  return join(dir, "faceshare.log");
};

admin.get("/logs", (c) => {
  const lines = Math.min(parseInt(c.req.query("lines") ?? "200", 10), 2000);
  const levelFilter = c.req.query("level");
  const search = c.req.query("q");

  try {
    const raw = readFileSync(LOG_PATH(), "utf-8");
    let entries = raw
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return { message: l, level: "info", time: Date.now() };
        }
      });

    if (levelFilter) {
      entries = entries.filter((e) => String(e.level) === levelFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      entries = entries.filter((e) => JSON.stringify(e).toLowerCase().includes(s));
    }

    const tail = entries.slice(-lines);
    return sendSuccess(c, { data: tail, total: entries.length });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return sendSuccess(c, { data: [], total: 0 });
    }
    throw err;
  }
});

export { admin };
