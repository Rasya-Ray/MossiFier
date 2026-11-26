import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findDeviceForUser } from "@/lib/device-access";
import { SENSOR_COLUMNS, type SensorReading } from "@/lib/sensors";
import { getAdminClient } from "@/lib/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/readings/history?deviceId=MOSS-B0A7322B0960&limit=20
 *
 * Riwayat sensor untuk grafik (barisan tabel devices).
 * Dibaca server-side (service role) karena tabel devices memakai RLS
 * tanpa policy anon.
 */
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const url = new URL(request.url);
  const access = await findDeviceForUser(
    url.searchParams.get("deviceId"),
    user,
  );
  if (!access.ok) return jsonError(access.error, access.status);

  const limitRaw = Number(url.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100)
    : 20;

  try {
    const { data, error } = await getAdminClient()
      .from("devices")
      .select(SENSOR_COLUMNS)
      .eq("device_id", access.device.deviceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // `id` dan `device_id` internal tidak pernah dikirim ke browser.
    const readings = ((data ?? []) as SensorReading[])
      .slice()
      .reverse()
      .map(({ id, device_id, ...reading }) => {
        void id;
        void device_id;
        return reading;
      });
    return NextResponse.json({
      ok: true,
      deviceId: access.device.deviceId,
      readings,
    });
  } catch (error) {
    console.error("[readings/history] gagal:", error);
    return jsonError("Riwayat sensor belum bisa dimuat.", 503);
  }
}
