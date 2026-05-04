import pino from "pino";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const logDir = process.env.LOG_DIR ?? join(process.cwd(), "logs");

if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    ...(isDev && {
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    }),
  },
  isDev
    ? undefined
    : pino.destination({
        dest: join(logDir, "faceshare.log"),
        minLength: 4096,
        sync: false,
      }),
);
