import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { initDb } from "./db/index.js";
import { logger } from "./lib/logger.js";
import { syncAllPeople } from "./lib/sync.js";
import { randomUUID } from "node:crypto";
import { getDb } from "./db/index.js";
import { users } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { hash } from "bcrypt";

const port = parseInt(process.env.PORT ?? "3001", 10);
const dbPath = process.env.DATABASE_PATH ?? "/data/faceshare.db";

initDb(dbPath);

// Create initial admin user if no users exist
async function ensureAdminUser() {
  const db = getDb();
  const existingUsers = db.select().from(users).all();

  if (existingUsers.length === 0) {
    const adminEmail = process.env.ADMIN_EMAIL ?? "admin@faceshare.local";
    const adminPassword = process.env.ADMIN_PASSWORD ?? randomUUID().slice(0, 16);
    const adminName = process.env.ADMIN_NAME ?? "Administrator";

    try {
      const passwordHash = await hash(adminPassword, 10);

      db.insert(users).values({
        id: crypto.randomUUID(),
        name: adminName,
        email: adminEmail,
        emailVerified: true,
        password: passwordHash,
        role: "admin",
      }).run();

      logger.info(
        { email: adminEmail, password: adminPassword },
        "initial admin user created — save this password!",
      );
    } catch (err) {
      logger.error(err, "admin user creation failed (will retry on next start)");
    }
  } else {
    logger.info("existing users found, skipping admin creation");
  }
}

// Initial sync from Immich on startup
syncAllPeople()
  .then(({ synced, totalAssets }) => {
    logger.info({ synced, totalAssets }, "initial people sync complete");
  })
  .catch((err) => {
    logger.error(err, "initial people sync failed (is Immich reachable?)");
  });

// Create admin user after server starts
serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info({ port: info.port }, "server started");
    ensureAdminUser();
  },
);
