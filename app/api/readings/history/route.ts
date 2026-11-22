import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findDeviceForUser } from "@/lib/device-access";
import { SENSOR_COLUMNS, type SensorReading } from "@/lib/sensors";
import { getAdminClient } from "@/lib/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/readings/history?macAddress=B0A7322B0960&limit=20
 *
 * Riwayat sensor untuk grafik. Dibaca server-side (service role) karena
 * tabel sensor_readings memakai RLS tanpa policy anon.
 */
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const url = new URL(request.url);
  const access = await findDeviceForUser(
    url.searchParams.get("macAddress"),
    user,
  );
  if (!access.ok) return jsonError(access.error, access.status);

  const limitRaw = Number(url.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100)
    : 20;

  try {
    const { data, error } = await getAdminClient()
      .from("sensor_readings")
      .select(SENSOR_COLUMNS)
      .eq("device_id", access.device.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    // `device_id` internal tidak pernah dikirim ke browser.
    const readings = ((data ?? []) as SensorReading[])
      .slice()
      .reverse()
      .map(({ device_id, ...reading }) => {
        void device_id;
        return reading;
      });
    return NextResponse.json({
      ok: true,
      macAddress: access.device.macAddress,
      readings,
    });
  } catch (error) {
    console.error(
      "[readings/history] gagal:",
      error instanceof Error ? error.message : error,
    );
    return jsonError("Riwayat sensor belum bisa dimuat.", 503);
  }
}
