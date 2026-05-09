import type Database from "better-sqlite3";
import { logger } from "../lib/logger.js";

export function migrate(sqlite: Database.Database) {
  logger.info("running schema migrations");

  // ── Users table (better-auth compatible) ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      password TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // ── Sessions table (better-auth) ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  `);

  // ── Accounts table (better-auth) ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
  `);

  // ── Verifications table (better-auth) ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // ── All other tables ──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      immich_person_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      thumbnail_url TEXT,
      asset_count INTEGER NOT NULL DEFAULT 0,
      sync_date INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS asset_cache (
      id TEXT PRIMARY KEY,
      immich_asset_id TEXT NOT NULL UNIQUE,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      thumbnail_url TEXT NOT NULL,
      exif TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS access_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      reviewed_at INTEGER,
      reviewed_by TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      granted_at INTEGER NOT NULL DEFAULT (unixepoch()),
      expires_at INTEGER,
      revoked_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS download_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
      zip_path TEXT,
      expires_at INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS shared_links (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES asset_cache(id) ON DELETE CASCADE,
      recipient_email TEXT NOT NULL,
      access_code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_shared_links_code ON shared_links(code);
    CREATE INDEX IF NOT EXISTS idx_shared_links_user ON shared_links(user_id);
    CREATE INDEX IF NOT EXISTS idx_shared_links_asset ON shared_links(asset_id);
    CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
    CREATE INDEX IF NOT EXISTS idx_access_requests_user ON access_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_user_person ON approvals(user_id, person_id);
    CREATE INDEX IF NOT EXISTS idx_asset_cache_person ON asset_cache(person_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_download_jobs_user ON download_jobs(user_id);
  `);

  // ── FTS ──
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS people_fts USING fts5(
      name,
      content='people',
      content_rowid='rowid'
    );
  `);

  const ftsTriggers = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'people_ai'",
  ).get();

  if (!ftsTriggers) {
    sqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS people_ai AFTER INSERT ON people BEGIN
        INSERT INTO people_fts(rowid, name) VALUES (new.rowid, new.name);
      END;
      CREATE TRIGGER IF NOT EXISTS people_ad AFTER DELETE ON people BEGIN
        INSERT INTO people_fts(people_fts, rowid, name) VALUES('delete', old.rowid, old.name);
      END;
      CREATE TRIGGER IF NOT EXISTS people_au AFTER UPDATE ON people BEGIN
        INSERT INTO people_fts(people_fts, rowid, name) VALUES('delete', old.rowid, old.name);
        INSERT INTO people_fts(rowid, name) VALUES (new.rowid, new.name);
      END;
    `);
  }

  logger.info("schema migrations complete");
}

export function rebuildFts(sqlite: Database.Database) {
  logger.info("rebuilding FTS index");
  sqlite.exec(`
    INSERT INTO people_fts(people_fts) VALUES('rebuild');
  `);
}
