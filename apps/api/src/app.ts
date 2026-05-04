import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { logger as httpLogger } from "hono/logger";
import { logger } from "./lib/logger.js";
import { getDb } from "./db/index.js";

const app = new Hono();

app.use("*", cors({ origin: "*" }));
app.use("*", prettyJSON());
app.use(
  "*",
  httpLogger((msg: string) => logger.info(msg)),
);

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get("/health/db", (c) => {
  try {
    const db = getDb();
    const result = db.run("SELECT 1 AS alive");
    return c.json({ status: "ok", db: result.changes === 1 });
  } catch (err) {
    logger.error(err, "health check failed");
    return c.json({ status: "error", message: "database unreachable" }, 503);
  }
});

export { app };
