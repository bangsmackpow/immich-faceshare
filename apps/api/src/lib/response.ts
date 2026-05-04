import type { Context } from "hono";
import { logger } from "./logger.js";

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

export function sendError(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorResponse = { code, message };
  if (details !== undefined) body.details = details;

  logger.warn({ status, code, message, details }, "api error");
  return c.json(body, status as any);
}

export function sendSuccess<T>(c: Context, data: T, status: number = 200) {
  return c.json(data, status as any);
}
