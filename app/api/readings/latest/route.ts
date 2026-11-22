import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findDeviceByIdForUser, findDeviceForUser } from "@/lib/device-access";
import { getCachedLatest, setCachedLatest } from "@/lib/redis";
import { parseReading } from "@/lib/readings/validation";
import {
  SENSOR_COLUMNS,
  type LatestReadingResponse,
  type PublicSensorReading,
  type SensorReading,
} from "@/lib/sensors";
import { getAdminClient } from "@/lib/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function jsonResponse(body: LatestReadingResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

/** Jangan pernah kirim `devices.id` ke browser. */
function toPublic(reading: SensorReading): PublicSensorReading {
  const { device_id: _deviceId, ...rest } = reading;
  void _deviceId;
  return rest;
}

/** Fallback: 1 baris terbaru dari tabel sensor_readings (server-side). */
async function fetchLatestFromSupabase(
  deviceId: number,
): Promise<SensorReading | null> {
  const { data, error } = await getAdminClient()
    .from("sensor_readings")
    .select(SENSOR_COLUMNS)
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SensorReading | null) ?? null;
}

/**
 * GET /api/readings/latest?macAddress=B0A7322B0960
 * Redis-first; kalau kosong, ambil satu baris terbaru dari Supabase.
 */
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const macAddress = new URL(request.url).searchParams.get("macAddress");
  const access = await findDeviceForUser(macAddress, user);
  if (!access.ok) return jsonError(access.error, access.status);

  const { id: deviceId, macAddress: mac } = access.device;

  const cached = await getCachedLatest(deviceId);
  if (cached) {
    const { cached_at, device_id: _deviceId, ...reading } = cached;
    void _deviceId;
    return jsonResponse({
      reading,
      macAddress: mac,
      source: "redis",
      cachedAt: cached_at,
    });
  }

  try {
    const reading = await fetchLatestFromSupabase(deviceId);
    if (!reading) {
      return jsonResponse({
        reading: null,
        macAddress: mac,
        source: "none",
        cachedAt: null,
      });
    }

    const stored = await setCachedLatest(reading);
    return jsonResponse({
      reading: toPublic(reading),
      macAddress: mac,
      source: "supabase",
      cachedAt: stored ? Date.now() : null,
    });
  } catch (error) {
    console.error(
      "[readings/latest] gagal:",
      error instanceof Error ? error.message : error,
    );
    return jsonError("Data terakhir belum bisa dimuat.", 503);
  }
}

/**
 * POST /api/readings/latest
 * Dipakai untuk menulis cache dari event pembacaan (cadangan webhook).
 * device_id internal diverifikasi kepemilikannya sebelum ditulis ke Redis.
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const body = (await request.json().catch(() => null)) as unknown;
  const reading = parseReading(body);
  if (!reading) return jsonError("Format pembacaan sensor tidak valid.", 400);

  const access = await findDeviceByIdForUser(reading.device_id, user);
  if (!access.ok) return jsonError(access.error, access.status);

  const stored = await setCachedLatest(reading);
  if (!stored) return jsonError("Cache Redis belum bisa diperbarui.", 503);

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
