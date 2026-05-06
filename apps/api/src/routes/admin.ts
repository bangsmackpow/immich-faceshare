import { Hono } from "hono";
import { eq, desc, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { getDb, checkDbHealth } from "../db/index.js";
import {
  accessRequests,
  approvals as approvalsTable,
  auditLog,
  people,
  users,
  downloadJobs,
} from "../db/schema.js";
import { authMiddleware, adminGuard, type AuthUser } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { logger } from "../lib/logger.js";
import { sendApprovalNotification } from "../lib/email.js";
import { getImmichClient } from "../lib/immich.js";
import { jobQueue } from "../lib/download-queue.js";
import { syncAllPeople } from "../lib/sync.js";
import { hash } from "bcrypt";

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
  const user = c.get("user") as AuthUser;
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
  "/api/people",
  "/api/server/ping",
  "/api/assets",
  "/api/search/metadata",
  "/api/albums",
];

admin.get("/playground/endpoints", (c) => {
  return sendSuccess(c, { data: IMMICH_ENDPOINTS });
});

admin.post("/playground/execute", async (c) => {
  const user = c.get("user") as AuthUser;
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

// ── Sync People ──
admin.post("/sync", async (c) => {
  const user = c.get("user") as AuthUser;
  try {
    const result = await syncAllPeople();
    getDb().insert(auditLog).values({
      id: randomUUID(),
      userId: user.id,
      action: "sync.people",
      details: JSON.stringify(result),
      ip: null,
      createdAt: new Date(),
    }).run();
    return sendSuccess(c, { data: result });
  } catch (err) {
    return sendError(c, 502, "SYNC_FAILED", (err as Error).message);
  }
});

// ── Health & Status ──
admin.get("/status", async (c) => {
  const start = Date.now();

  const dbHealth = checkDbHealth();
  const dbOk = dbHealth.healthy;

  let immichOk = false;
  let immichVersion: string | null = null;
  try {
    const client = getImmichClient();
    immichOk = await client.ping();
    if (immichOk) {
      const people = await client.getPeople();
      immichVersion = `${people.total} people indexed`;
    }
  } catch { /* immich unreachable */ }

  const db = getDb();
  const userCount = db.select({ count: count() }).from(users).get()?.count ?? 0;
  const personCount = db.select({ count: count() }).from(people).get()?.count ?? 0;
  const pendingRequests = db
    .select({ count: count() })
    .from(accessRequests)
    .where(eq(accessRequests.status, "pending"))
    .get()?.count ?? 0;
  const activeDownloads = jobQueue.length;

  const dbPath = process.env.DATABASE_PATH ?? "/data/faceshare.db";
  const dbSize = existsSync(dbPath) ? statSync(dbPath).size : 0;

  return sendSuccess(c, {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    database: {
      healthy: dbOk,
      error: dbHealth.error ?? null,
      path: dbPath,
      sizeBytes: dbSize,
      latencyMs: Date.now() - start,
    },
    immich: {
      healthy: immichOk,
      version: immichVersion,
    },
    stats: {
      users: userCount,
      people: personCount,
      pendingRequests,
      activeDownloads,
    },
  });
});

// ── DB Backup ──
admin.post("/backup", (c) => {
  const dbPath = process.env.DATABASE_PATH ?? "/data/faceshare.db";
  const backupDir = process.env.BACKUP_DIR ?? "/data/backups";

  if (!existsSync(dbPath)) {
    return sendError(c, 404, "DB_NOT_FOUND", "Database file not found");
  }

  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(backupDir, `faceshare-${timestamp}.db`);

  try {
    copyFileSync(dbPath, backupPath);
    logger.info({ backupPath, size: statSync(backupPath).size }, "db backup created");
    return sendSuccess(c, { path: backupPath, size: statSync(backupPath).size, createdAt: new Date() });
  } catch (err) {
    return sendError(c, 500, "BACKUP_FAILED", (err as Error).message);
  }
});

// ── DB Restore ──
admin.post("/restore", async (c) => {
  const dbPath = process.env.DATABASE_PATH ?? "/data/faceshare.db";
  const backupDir = process.env.BACKUP_DIR ?? "/data/backups";

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const backupFile = body?.backupFile as string | undefined;

  if (!backupFile) {
    return sendError(c, 400, "INVALID_REQUEST", "backupFile is required");
  }

  const safeName = basename(backupFile);
  const sourcePath = join(backupDir, safeName);

  if (!existsSync(sourcePath)) {
    return sendError(c, 404, "BACKUP_NOT_FOUND", `Backup file not found: ${safeName}`);
  }

  try {
    copyFileSync(sourcePath, dbPath);
    logger.info({ source: sourcePath }, "db restored from backup");
    return sendSuccess(c, { ok: true, message: "Database restored. Restart required for changes to take effect." });
  } catch (err) {
    return sendError(c, 500, "RESTORE_FAILED", (err as Error).message);
  }
});

// ── List Backups ──
admin.get("/backups", (c) => {
  const backupDir = process.env.BACKUP_DIR ?? "/data/backups";

  if (!existsSync(backupDir)) {
    return sendSuccess(c, { data: [] });
  }

  try {
    const files = readdirSync(backupDir)
      .filter((f) => f.endsWith(".db"))
      .map((f) => {
        const path = join(backupDir, f);
        const stat = statSync(path);
        return { name: f, size: stat.size, createdAt: stat.mtime };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return sendSuccess(c, { data: files });
  } catch (err) {
    return sendError(c, 500, "LIST_BACKUPS_FAILED", (err as Error).message);
  }
});

// ── User Management ──
admin.get("/users", (c) => {
  const db = getDb();
  const rows = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .all();
  return sendSuccess(c, { data: rows, total: rows.length });
});

admin.post("/users", async (c) => {
  const adminUser = c.get("user") as AuthUser;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = body?.email as string | undefined;
  const name = body?.name as string | undefined;
  const password = body?.password as string | undefined;
  const role = (body?.role as "admin" | "user") ?? "user";

  if (!email || !name || !password) {
    return sendError(c, 400, "INVALID_REQUEST", "email, name, and password are required");
  }
  if (password.length < 8) {
    return sendError(c, 400, "INVALID_REQUEST", "password must be at least 8 characters");
  }

  try {
    const res = await fetch(`http://localhost:${process.env.PORT ?? "3001"}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      return sendError(c, 400, "CREATE_FAILED", errBody?.message ?? "Failed to create user");
    }

    const created = (await res.json()) as { user: { id: string } };
    const db = getDb();
    db.update(users)
      .set({ role })
      .where(eq(users.id, created.user.id))
      .run();

    db.insert(auditLog)
      .values({
        id: randomUUID(),
        userId: adminUser.id,
        action: "user.create",
        details: JSON.stringify({ userId: created.user.id, email, role }),
        ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        createdAt: new Date(),
      })
      .run();

    return sendSuccess(c, { data: { id: created.user.id, email, name, role } });
  } catch (err) {
    return sendError(c, 500, "CREATE_FAILED", (err as Error).message);
  }
});

admin.put("/users/:id", async (c) => {
  const adminUser = c.get("user") as AuthUser;
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = body?.name as string | undefined;
  const role = body?.role as "admin" | "user" | undefined;

  if (id === adminUser.id && role && role !== "admin") {
    return sendError(c, 400, "INVALID_REQUEST", "Cannot demote yourself");
  }

  const db = getDb();
  const existing = db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) {
    return sendError(c, 404, "NOT_FOUND", "User not found");
  }

  const updates: Record<string, string> = {};
  if (name) updates.name = name;
  if (role) updates.role = role;

  if (Object.keys(updates).length > 0) {
    db.update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .run();
  }

  db.insert(auditLog)
    .values({
      id: randomUUID(),
      userId: adminUser.id,
      action: "user.update",
      details: JSON.stringify({ userId: id, ...updates }),
      ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
      createdAt: new Date(),
    })
    .run();

  return sendSuccess(c, { data: { ...existing, ...updates } });
});

admin.delete("/users/:id", (c) => {
  const adminUser = c.get("user") as AuthUser;
  const id = c.req.param("id");

  if (id === adminUser.id) {
    return sendError(c, 400, "INVALID_REQUEST", "Cannot delete yourself");
  }

  const db = getDb();
  const existing = db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) {
    return sendError(c, 404, "NOT_FOUND", "User not found");
  }

  db.delete(users).where(eq(users.id, id)).run();

  db.insert(auditLog)
    .values({
      id: randomUUID(),
      userId: adminUser.id,
      action: "user.delete",
      details: JSON.stringify({ userId: id, email: existing.email }),
      ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
      createdAt: new Date(),
    })
    .run();

  return sendSuccess(c, { ok: true });
});

admin.post("/users/:id/reset-password", async (c) => {
  const adminUser = c.get("user") as AuthUser;
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const newPassword = (body?.password as string) ?? randomUUID().slice(0, 16);

  if (newPassword.length < 8) {
    return sendError(c, 400, "INVALID_REQUEST", "password must be at least 8 characters");
  }

  const db = getDb();
  const existing = db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) {
    return sendError(c, 404, "NOT_FOUND", "User not found");
  }

  try {
    const hashed = await hash(newPassword, 10);
    db.update(users)
      .set({ password: hashed, updatedAt: new Date() })
      .where(eq(users.id, id))
      .run();

    db.insert(auditLog)
      .values({
        id: randomUUID(),
        userId: adminUser.id,
        action: "user.reset_password",
        details: JSON.stringify({ userId: id, email: existing.email }),
        ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        createdAt: new Date(),
      })
      .run();

    return sendSuccess(c, { data: { password: newPassword } });
  } catch (err) {
    return sendError(c, 500, "RESET_FAILED", (err as Error).message);
  }
});

export { admin };
