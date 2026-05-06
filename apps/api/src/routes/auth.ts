import { Hono } from "hono";
import {
  verifyGoogleToken,
  findOrCreateUser,
  createSessionToken,
  authMiddleware,
} from "../middleware/auth.js";
import { sendError } from "../lib/response.js";
import { logger } from "../lib/logger.js";
import { randomUUID } from "node:crypto";

const auth = new Hono();

auth.get("/google/login", (c) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL;
  logger.info(
    {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRedirectUri: !!redirectUri,
      redirectUri,
    },
    "google login initiated",
  );
  if (!clientId || !redirectUri) {
    return sendError(c, 500, "CONFIG_ERROR", "GOOGLE_CLIENT_ID or GOOGLE_CALLBACK_URL not set");
  }
  const state = randomUUID();
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid+email+profile&state=${state}`;

  c.header("Set-Cookie", `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`);

  logger.info({ redirectUrl: url.slice(0, 120) }, "redirecting to google");
  return c.redirect(url);
});

auth.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  const cookies = c.req.header("cookie") ?? "";
  const stateCookie = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("oauth_state="))
    ?.split("=")[1];

  if (!stateCookie || state !== stateCookie) {
    logger.warn({ state, stateCookie }, "oauth state mismatch");
    return sendError(c, 400, "INVALID_STATE", "OAuth state validation failed");
  }

  if (!code) {
    return sendError(c, 400, "INVALID_REQUEST", "Missing authorization code");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL;

  if (!clientId || !clientSecret || !redirectUri) {
    return sendError(c, 500, "CONFIG_ERROR", "Google OAuth not configured");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      logger.error({ status: tokenRes.status, body: text }, "token exchange failed");
      return sendError(c, 401, "AUTH_FAILED", "Token exchange failed");
    }

    const tokenData = (await tokenRes.json()) as Record<string, string>;
    const idToken = tokenData.id_token;
    if (!idToken) {
      return sendError(c, 401, "AUTH_FAILED", "No ID token in response");
    }

    const googlePayload = await verifyGoogleToken(idToken);
    const user = await findOrCreateUser(googlePayload);
    const sessionToken = await createSessionToken(user);

    const frontendUrl = process.env.FRONTEND_URL ?? `${new URL(c.req.url).origin}`;
    const redirectUrl = `${frontendUrl}/login?token=${sessionToken}`;

    c.header("Set-Cookie", `oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    c.header("Set-Cookie", `session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);

    return c.redirect(redirectUrl);
  } catch (err) {
    logger.error(err, "google callback failed");
    return sendError(c, 401, "AUTH_FAILED", "Google auth failed");
  }
});

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
