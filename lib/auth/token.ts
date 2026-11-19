import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionUser } from "@/lib/auth/types";

/** Nama cookie sesi. Dipakai di server (route handler) dan proxy. */
export const SESSION_COOKIE = "mossifier_session";

/** Umur sesi: 7 hari. */
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = SessionUser & { exp: number };

function secret(): string {
  return process.env.AUTH_SECRET ?? "mossifier-dev-secret";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    ...user,
    exp: Date.now() + MAX_AGE_SECONDS * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Baca + verifikasi token sesi. Murni (tanpa `next/headers`),
 * jadi aman dipakai di proxy maupun route handler.
 */
export function readSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;

    if (!payload?.id || !payload?.email) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;

    return { id: payload.id, email: payload.email, name: payload.name ?? null };
  } catch {
    return null;
  }
}
