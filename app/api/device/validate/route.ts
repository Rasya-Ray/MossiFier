import { NextResponse } from "next/server";
import { findDeviceForUser } from "@/lib/device-access";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/device/validate — { deviceId: "MOSS-B0A7322B0960" }
 *
 * Cek apakah ID device valid (format MOSS-) dan sudah terdaftar di DB
 * (sudah pernah kirim data lewat ESP32). Tidak menulis apa pun.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { deviceId?: unknown }
    | null;

  const access = await findDeviceForUser(body?.deviceId, null);
  if (!access.ok) return jsonError(access.error, access.status);

  return NextResponse.json({ ok: true, deviceId: access.device.deviceId });
}
