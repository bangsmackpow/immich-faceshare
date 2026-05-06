import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { logger } from "../lib/logger.js";
import { migrate } from "./migrate.js";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database | null = null;

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function isDbReady(): boolean {
  return db !== undefined && sqlite !== null;
}

export function checkDbHealth(): { healthy: boolean; error?: string } {
  if (!sqlite || !db) {
    return { healthy: false, error: "Database not initialized" };
  }
  try {
    sqlite.pragma("quick_check");
    return { healthy: true };
  } catch (err) {
    return { healthy: false, error: (err as Error).message };
  }
}

export function initDb(dbPath: string) {
  // Ensure parent directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  sqlite = new Database(dbPath);

  // Production pragmas
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("cache_size = -64000"); // 64MB
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("mmap_size = 268435456"); // 256MB

  db = drizzle(sqlite, { schema });

  migrate(sqlite);

  logger.info({ path: dbPath }, "database initialized");
  return db;
}
