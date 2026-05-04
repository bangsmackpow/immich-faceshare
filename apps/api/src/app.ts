import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { logger as httpLogger } from "hono/logger";
import { logger } from "./lib/logger.js";
import { getDb } from "./db/index.js";
import { auth } from "./routes/auth.js";
import { peopleRoute } from "./routes/people.js";
import { requests } from "./routes/requests.js";
import { assets } from "./routes/assets.js";
import { downloads } from "./routes/downloads.js";
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
    db.run("SELECT 1 AS alive");
    return c.json({ status: "ok", db: true });
  } catch (err) {
    logger.error(err, "health check failed");
    return c.json({ status: "error", message: "database unreachable" }, 503);
  }
});

app.route("/api/auth", auth);
app.route("/api/people", peopleRoute);
app.route("/api/requests", requests);
app.route("/api/assets", assets);
app.route("/api/downloads", downloads);

app.onError((err, c) => {
  logger.error(err, "unhandled error");
  return c.json(
    { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    500,
  );
});

app.notFound((c) => {
  return c.json({ code: "NOT_FOUND", message: `Route not found: ${c.req.method} ${c.req.path}` }, 404);
});

export { app };
