import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { initDb } from "./db/index.js";
import { logger } from "./lib/logger.js";
import { syncAllPeople } from "./lib/sync.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const dbPath = process.env.DATABASE_PATH ?? "/data/faceshare.db";

initDb(dbPath);

// Initial sync from Immich on startup
syncAllPeople()
  .then(({ synced, totalAssets }) => {
    logger.info({ synced, totalAssets }, "initial people sync complete");
  })
  .catch((err) => {
    logger.error(err, "initial people sync failed (is Immich reachable?)");
  });

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info({ port: info.port }, "server started");
  },
);
