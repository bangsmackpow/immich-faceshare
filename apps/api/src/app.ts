import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import { logger as httpLogger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { join, dirname, extname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { getDb } from "./db/index.js";
import { auth } from "./routes/auth.js";
import { peopleRoute } from "./routes/people.js";
import { requests } from "./routes/requests.js";
import { assets } from "./routes/assets.js";
import { downloads } from "./routes/downloads.js";
import { admin } from "./routes/admin.js";
const app = new Hono();

app.use("*", cors({ origin: "*" }));
app.use("*", prettyJSON());
app.use(
  "*",
  httpLogger((msg: string) => logger.info(msg)),
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = join(__dirname, "../../web/dist");

app.use("/assets/*", serveStatic({ root: WEB_DIST }));

const STATIC_FILES = ["sw.js", "manifest.webmanifest", "favicon.ico"];
for (const file of STATIC_FILES) {
  app.get(`/${file}`, serveStatic({ path: join(WEB_DIST, file) }));
}

app.get("/", serveStatic({ path: join(WEB_DIST, "index.html") }));

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
app.route("/api/admin", admin);

app.get("/*", (c) => {
  const filePath = join(WEB_DIST, c.req.path);
  if (existsSync(filePath)) {
    return new Response(readFileSync(filePath), {
      headers: { "content-type": extname(filePath) === ".js" ? "application/javascript" : "text/plain" },
    });
  }
  return c.html(readFileSync(join(WEB_DIST, "index.html"), "utf-8"));
});

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
