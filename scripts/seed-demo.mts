/**
 * Seed data sensor PALSU untuk demo saat ESP32 offline.
 *
 * Cara pakai:
 *   npm run seed:demo
 *   npm run seed:demo -- --rows 30 --interval 60
 *   npm run seed:demo -- --device MOSS-B0A7322B0960 --rows 20 --interval 120
 *
 * Yang dilakukan skrip:
 * 1. Membuat N baris data sensor realistis (CO₂, PM, kelembapan, dll).
 * 2. Insert ke tabel `devices` lewat Supabase (pakai service role dari `.env`).
 * 3. Menulis baris terbaru ke cache Redis `mossifier:latest:v2:<device_id>`
 *    supaya endpoint "/api/readings/latest" langsung segar.
 *
 * Skrip tidak mengubah firmware atau kode aplikasi.
 */

import { createClient } from "@supabase/supabase-js";
import { createClient as createRedisClient } from "redis";

const DEVICE_ID_PATTERN = /^MOSS-[0-9A-F]{12}$/;
const REDIS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

type SeedRow = {
  device_id: string;
  created_at: string;
  status: string;
  co2_in: number;
  co2_out: number;
  humidity: number;
  brightness: number;
  fan_speed: number;
  pump: boolean;
  pm1: number;
  pm25: number;
  pm10: number;
};

function strip(value: string | undefined): string {
  return (value ?? "").replace(/^["']|["']$/g, "").trim();
}

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readNumberArg(flag: string, fallback: number): number {
  const raw = readArg(flag);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Angka acak di sekitar `base` (random walk halus, bukan lompat-lompat). */
function drift(base: number, jitter: number, min: number, max: number): number {
  return clamp(base + (Math.random() - 0.5) * 2 * jitter, min, max);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildRows(
  deviceId: string,
  count: number,
  intervalSeconds: number,
): SeedRow[] {
  const now = Date.now();
  const start = now - (count - 1) * intervalSeconds * 1000;

  let co2In = 900;
  let co2Out = 470;
  let humidity = 78;
  let brightness = 72;
  let fanSpeed = 60;
  let pm1 = 12;
  let pump = false;

  const rows: SeedRow[] = [];

  for (let index = 0; index < count; index += 1) {
    co2In = drift(co2In, 180, 450, 1800);
    co2Out = drift(co2Out, 60, 350, 700);
    humidity = drift(humidity, 4, 55, 92);
    brightness = drift(brightness, 6, 20, 100);
    pm1 = drift(pm1, 3, 3, 35);

    // Kipas berubah dalam langkah persen, bukan tiap detik.
    if (Math.random() < 0.15) {
      fanSpeed = [40, 60, 80, 100][Math.floor(Math.random() * 4)] ?? 60;
    }
    // Pompa sesekali menyala.
    if (Math.random() < 0.12) pump = !pump;

    const pm25 = round1(pm1 * (1.7 + Math.random() * 0.5));
    const pm10 = round1(pm25 * (1.1 + Math.random() * 0.4));

    rows.push({
      device_id: deviceId,
      created_at: new Date(start + index * intervalSeconds * 1000).toISOString(),
      status: humidity < 62 ? "STRESSED" : "HEALTHY",
      co2_in: Math.round(co2In),
      co2_out: Math.round(co2Out),
      humidity: Math.round(humidity),
      brightness: Math.round(brightness),
      fan_speed: fanSpeed,
      pump,
      pm1: round1(pm1),
      pm25,
      pm10,
    });
  }

  return rows;
}

async function writeRedisCache(row: SeedRow, id: number): Promise<boolean> {
  const url = strip(process.env.REDIS_URL);
  if (!url) {
    console.warn("⚠ REDIS_URL kosong — cache Redis tidak diperbarui.");
    return false;
  }

  const client = createRedisClient({ url });
  client.on("error", (error) => {
    console.error("⚠ Redis error:", error instanceof Error ? error.message : error);
  });

  try {
    await client.connect();
    const key = `mossifier:latest:v2:${row.device_id}`;
    await client.hSet(key, {
      id: String(id),
      device_id: row.device_id,
      created_at: row.created_at,
      status: row.status,
      co2_in: String(row.co2_in),
      co2_out: String(row.co2_out),
      humidity: String(row.humidity),
      brightness: String(row.brightness),
      fan_speed: String(row.fan_speed),
      pump: String(row.pump),
      pm1: String(row.pm1),
      pm25: String(row.pm25),
      pm10: String(row.pm10),
      cached_at: String(Date.now()),
    });
    await client.expire(key, REDIS_CACHE_TTL_SECONDS);
    console.log(`✓ Cache Redis diperbarui: ${key}`);
    return true;
  } catch (error) {
    console.error(
      "⚠ Gagal menulis cache Redis:",
      error instanceof Error ? error.message : error,
    );
    return false;
  } finally {
    if (client.isOpen) await client.quit();
  }
}

async function main(): Promise<void> {
  const rawDeviceId =
    readArg("--device") ??
    strip(process.env.NEXT_PUBLIC_DEFAULT_DEVICE_ID) ??
    "MOSS-B0A7322B0960";
  const deviceId = rawDeviceId.toUpperCase();

  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new Error(
      `ID device tidak valid: "${rawDeviceId}". Formatnya MOSS- + 12 hex, contoh MOSS-B0A7322B0960.`,
    );
  }

  const count = clamp(Math.trunc(readNumberArg("--rows", 15)), 1, 200);
  const interval = clamp(Math.trunc(readNumberArg("--interval", 120)), 0, 3600);

  const supabaseUrl = strip(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = strip(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum ada di .env.",
    );
  }

  const rows = buildRows(deviceId, count, interval);
  console.log(
    `Menyisipkan ${rows.length} baris data palsu untuk ${deviceId} (interval ${interval} detik)…`,
  );

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("devices")
    .insert(rows)
    .select("id, created_at");

  if (error) {
    throw new Error(`Insert gagal: ${error.message}`);
  }

  const inserted = (data ?? []) as Array<{ id: number; created_at: string }>;
  console.log(`✓ ${inserted.length} baris masuk ke tabel devices.`);

  // Baris terbaru = created_at paling akhir.
  const newest = rows[rows.length - 1];
  const newestRecord = inserted
    .slice()
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .at(-1);

  if (newest && newestRecord) {
    await writeRedisCache(newest, newestRecord.id);
    console.log("\nContoh data terbaru:");
    console.log(JSON.stringify(newest, null, 2));
  }

  console.log(
    "\nSelesai. Buka/refresh dashboard — grafik akan terisi dan angka terbaru langsung tampil.",
  );
}

main().catch((error) => {
  console.error("\n✗ Gagal:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
