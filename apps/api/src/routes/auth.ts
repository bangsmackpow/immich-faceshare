import { Hono } from "hono";
import {
  verifyGoogleToken,
  findOrCreateUser,
  createSessionToken,
  authMiddleware,
} from "../middleware/auth.js";
import { sendError } from "../lib/response.js";

const auth = new Hono();

auth.post("/google", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const idToken = body?.idToken;

  if (!idToken || typeof idToken !== "string") {
    return sendError(c, 400, "INVALID_REQUEST", "idToken is required");
  }

  try {
    const googlePayload = await verifyGoogleToken(idToken);
    const user = await findOrCreateUser(googlePayload);
    const token = await createSessionToken(user);

    return c.json({ token, user });
  } catch (err) {
    return sendError(
      c,
      401,
      "AUTH_FAILED",
      err instanceof Error ? err.message : "Google auth failed",
    );
  }
});

auth.get("/me", authMiddleware, async (c) => {
  const user = c.get("user");
  return c.json({ user });
});

auth.post("/logout", async (c) => {
  return c.json({ ok: true });
});

export { auth };
