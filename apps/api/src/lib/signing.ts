import { createHmac, timingSafeEqual } from "node:crypto";

const ALGORITHM = "sha256";

function getSecret(): string {
  const s = process.env.SIGNING_SECRET ?? process.env.SESSION_SECRET;
  if (!s) throw new Error("SIGNING_SECRET required for URL signing");
  return s;
}

export interface SignedPayload {
  resource: string;
  expiresAt: number;
}

export function signToken(payload: SignedPayload): string {
  const data = JSON.stringify(payload);
  const secret = getSecret();
  const hmac = createHmac(ALGORITHM, secret).update(data).digest("hex");
  const encoded = Buffer.from(data).toString("base64url");
  return `${encoded}.${hmac}`;
}

export function verifyToken(token: string): SignedPayload | null {
  const dot = token.indexOf(".");
  if (dot === -1) return null;

  const encoded = token.slice(0, dot);
  const hmac = token.slice(dot + 1);

  const secret = getSecret();
  const data = Buffer.from(encoded, "base64url").toString("utf-8");

  const expected = createHmac(ALGORITHM, secret).update(data).digest("hex");

  try {
    if (!timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }

  const payload = JSON.parse(data) as SignedPayload;

  if (Date.now() > payload.expiresAt) {
    return null;
  }

  return payload;
}

export function createSignedAssetUrl(assetId: string): string {
  const expiresAt = Date.now() + 3_600_000; // 1 hour
  const token = signToken({ resource: `asset:${assetId}`, expiresAt });
  return `/api/assets/proxy/${assetId}?token=${token}`;
}

export function createSignedDownloadUrl(jobId: string): string {
  const expiresAt = Date.now() + 86_400_000; // 24 hours
  const token = signToken({ resource: `download:${jobId}`, expiresAt });
  return `/api/downloads/serve/${jobId}?token=${token}`;
}
