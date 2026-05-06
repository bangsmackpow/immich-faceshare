import { Hono } from "hono";
import { getAuth } from "../auth/better-auth.js";

const authRoutes = new Hono();

// Mount better-auth handler at /api/auth/*
authRoutes.on(["POST", "GET"], "/*", async (c) => {
  return getAuth().handler(c.req.raw);
});

export { authRoutes };
