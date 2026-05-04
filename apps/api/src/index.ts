import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { initDb } from "./db/index.js";
import { logger } from "./lib/logger.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const dbPath = process.env.DATABASE_PATH ?? "/data/faceshare.db";

initDb(dbPath);

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    logger.info({ port: info.port }, "server started");
  },
);
