import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";
import { DEMO_EMAIL, DEMO_NAME, DEMO_USER_ID } from "@/lib/demo";

/**
 * POST /api/auth/demo — buka sesi demo untuk juri.
 *
 * Sesi demo sengaja tidak memakai baris di tabel `users`:
 * - tidak perlu register/seed database lebih dulu,
 * - dashboard tetap bisa dibuka walau database sedang bermasalah,
 * - cookie tetap ditandatangani HMAC, jadi `proxy.ts` dan `getSession()`
 *   memperlakukannya sama seperti sesi login biasa.
 *
 * Device ID demo diisi otomatis oleh `DeviceProvider` (lihat `lib/demo.ts`).
 */
export async function POST() {
  const user: SessionUser = {
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    name: DEMO_NAME,
  };

  await setSessionCookie(user);
  return NextResponse.json({ user });
}
