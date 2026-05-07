import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";

let _auth: ReturnType<typeof createAuthInstance> | null = null;

function createAuthInstance() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "user",
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
    },
    advanced: {
      cookiePrefix: "faceshare",
      useSecureCookies: process.env.NODE_ENV === "production",
      crossSubDomainCookies: {
        enabled: false,
      },
      defaultCookieAttributes: {
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    trustedOrigins: [
      process.env.FRONTEND_URL ?? "http://localhost:3001",
      "http://localhost:5173", // Vite dev
    ].filter(Boolean),
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.FRONTEND_URL,
  });
}

export function getAuth() {
  if (!_auth) {
    _auth = createAuthInstance();
  }
  return _auth;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: "admin" | "user";
};
