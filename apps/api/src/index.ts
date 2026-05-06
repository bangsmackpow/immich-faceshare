import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { initDb } from "./db/index.js";
import { logger } from "./lib/logger.js";
import { syncAllPeople } from "./lib/sync.js";
import { randomUUID } from "node:crypto";
import { getDb } from "./db/index.js";
import { users } from "./db/schema.js";
import { eq } from "drizzle-orm";

const port = parseInt(process.env.PORT ?? "3001", 10);
const dbPath = process.env.DATABASE_PATH ?? "/data/faceshare.db";

initDb(dbPath);

// Create initial admin user if no users exist
async function ensureAdminUser() {
  const db = getDb();
  const userCount = db.select({ count: users.id }).from(users).all().length;

  if (userCount === 0) {
    const adminEmail = process.env.ADMIN_EMAIL ?? "admin@faceshare.local";
    const adminPassword = process.env.ADMIN_PASSWORD ?? randomUUID().slice(0, 16);
    const adminName = process.env.ADMIN_NAME ?? "Administrator";

    try {
      // Use better-auth's internal API to create user with hashed password
      const res = await fetch(`http://localhost:${port}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
        }),
      });

      if (res.ok) {
        // Set role to admin directly in DB
        const created = await res.json() as { user: { id: string } };
        db.update(users)
          .set({ role: "admin" })
          .where(eq(users.id, created.user.id))
          .run();

        logger.info(
          { email: adminEmail, password: adminPassword },
          "initial admin user created — save this password!",
        );
      } else {
        const body = await res.text();
        logger.error({ status: res.status, body }, "failed to create admin user");
      }
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
