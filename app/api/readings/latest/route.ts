import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isValidDeviceId } from "@/lib/chat/sensor-context";
import { getCachedLatest, setCachedLatest } from "@/lib/redis";
import { parseReading } from "@/lib/readings/validation";
import {
  SENSOR_COLUMNS,
  type LatestReadingResponse,
  type SensorReading,
} from "@/lib/sensors";

// Route Handlers default to the Node.js runtime, required by the TCP Redis client.
function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function jsonResponse(body: LatestReadingResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

/** Fallback untuk mengisi Redis pertama kali atau jika key belum tersedia. */
async function fetchLatestFromSupabase(
  deviceId: string,
): Promise<SensorReading | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase belum dikonfigurasi.");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
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
 * GET /api/readings/latest?deviceId=...
 * Redis adalah jalur utama; Supabase hanya ditanya jika Redis belum punya key.
 */
export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const deviceId = new URL(request.url).searchParams.get("deviceId");
  if (!isValidDeviceId(deviceId)) return jsonError("Device ID tidak valid.", 400);

  const cached = await getCachedLatest(deviceId);
  if (cached) {
    const { cached_at, ...reading } = cached;
    return jsonResponse({ reading, source: "redis", cachedAt: cached_at });
  }

  try {
    const reading = await fetchLatestFromSupabase(deviceId);
    if (!reading) {
      return jsonResponse({ reading: null, source: "none", cachedAt: null });
    }

    // Tetap kembalikan data walaupun penulisan cache sedang gagal.
    const stored = await setCachedLatest(reading);
    return jsonResponse({
      reading,
      source: "supabase",
      cachedAt: stored ? Date.now() : null,
    });
  } catch (error) {
    console.error(
      "[readings/latest] gagal mengambil data terakhir:",
      error instanceof Error ? error.message : error,
    );
    return jsonError("Data terakhir belum bisa dimuat.", 503);
  }
}

/**
 * POST /api/readings/latest
 * Dashboard mengirim event INSERT Supabase Realtime ke Redis saat aktif.
 * Agar cache juga segar saat dashboard tutup, pasang Supabase Database Webhook
 * ke /api/readings/ingest (secret disimpan server-side).
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const body = (await request.json().catch(() => null)) as unknown;
  const reading = parseReading(body);
  if (!reading) return jsonError("Format pembacaan sensor tidak valid.", 400);

  const stored = await setCachedLatest(reading);
  if (!stored) return jsonError("Cache Redis belum bisa diperbarui.", 503);

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
