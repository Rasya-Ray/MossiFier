import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findDeviceForUser } from "@/lib/device-access";
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

/** Jangan pernah kirim `id` / `device_id` internal ke browser. */
function toPublic(reading: SensorReading): PublicSensorReading {
  const { id: _id, device_id: _deviceId, ...rest } = reading;
  void _id;
  void _deviceId;
  return rest;
}

/** Fallback: 1 baris terbaru dari tabel devices (server-side). */
async function fetchLatestFromSupabase(
  deviceId: string,
): Promise<SensorReading | null> {
  const { data, error } = await getAdminClient()
    .from("devices")
    .select(SENSOR_COLUMNS)
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SensorReading | null) ?? null;
}

/**
 * GET /api/readings/latest?deviceId=MOSS-B0A7322B0960
 * Redis-first; kalau kosong, ambil satu baris terbaru dari Supabase.
 */
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const deviceId = new URL(request.url).searchParams.get("deviceId");
  const access = await findDeviceForUser(deviceId, user);
  if (!access.ok) return jsonError(access.error, access.status);

  const { deviceId: did } = access.device;

  const cached = await getCachedLatest(did);
  if (cached) {
    const { id: _id, device_id: _deviceId, cached_at, ...reading } = cached;
    void _id;
    void _deviceId;
    return jsonResponse({
      reading,
      deviceId: did,
      source: "redis",
      cachedAt: cached_at,
    });
  }

  try {
    const reading = await fetchLatestFromSupabase(did);
    if (!reading) {
      return jsonResponse({
        reading: null,
        deviceId: did,
        source: "none",
        cachedAt: null,
      });
    }

    const stored = await setCachedLatest(reading);
    return jsonResponse({
      reading: toPublic(reading),
      deviceId: did,
      source: "supabase",
      cachedAt: stored ? Date.now() : null,
    });
  } catch (error) {
    console.error("[readings/latest] gagal:", error);
    return jsonError("Data terakhir belum bisa dimuat.", 503);
  }
}

/**
 * POST /api/readings/latest
 * Dipakai untuk menulis cache dari event pembacaan (cadangan webhook).
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const body = (await request.json().catch(() => null)) as unknown;
  const reading = parseReading(body);
  if (!reading) return jsonError("Format pembacaan sensor tidak valid.", 400);

  const access = await findDeviceForUser(reading.device_id, user);
  if (!access.ok) return jsonError(access.error, access.status);

  const stored = await setCachedLatest(reading);
  if (!stored) return jsonError("Cache Redis belum bisa diperbarui.", 503);

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
