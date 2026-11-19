import { cookies } from "next/headers";
import { connection } from "next/server";
import {
  MAX_AGE_SECONDS,
  SESSION_COOKIE,
  createSessionToken,
  readSessionToken,
} from "@/lib/auth/token";
import type { SessionUser } from "@/lib/auth/types";

/** Sesi dari cookie (server component / route handler). */
export async function getSession(): Promise<SessionUser | null> {
  // Tandai route sebagai dinamis supaya Date.now() tidak dievaluasi saat prerender.
  await connection();
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
