import { Hono } from "hono";
import { auth } from "../auth/better-auth.js";

const authRoutes = new Hono();

// Mount better-auth handler at /api/auth/*
authRoutes.on(["POST", "GET"], "/*", async (c) => {
  return auth.handler(c.req.raw);
});

export { authRoutes };
