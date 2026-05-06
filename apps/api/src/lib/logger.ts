import pino from "pino";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const logDir = process.env.LOG_DIR ?? join(process.cwd(), "logs");
const isDev = process.env.NODE_ENV !== "production";

if (!isDev && !existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const transports: pino.TransportTargetOptions[] = [];

if (isDev) {
  transports.push({ target: "pino-pretty", options: { colorize: true } });
} else {
  transports.push({ target: "pino/file", options: { destination: 1 } });
  if (process.env.LOG_TO_FILE === "true") {
    transports.push({
      target: "pino/file",
      options: { destination: join(logDir, "faceshare.log"), mkdir: true },
    });
  }
}

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    transport: { targets: transports },
  },
);
