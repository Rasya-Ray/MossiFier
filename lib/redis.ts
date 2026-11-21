import { createClient, type RedisClientType } from "redis";
import type { SensorReading } from "@/lib/sensors";

/**
 * Cache "pembacaan terakhir" per device di Upstash Redis (TCP, `REDIS_URL`).
 *
 * Kenapa: dashboard butuh 1 baris terakhir secepat mungkin. Membaca Supabase
 * (20 baris riwayat) bisa lambat; Redis hanya menyimpan SATU pembacaan terbaru
 * dengan field yang sama seperti kolom tabel `devices`, plus `cached_at`.
 *
 * Key   : `mossifier:latest:<device_id>`
 * Field : id, device_id, status, air_quality, co2_in, co2_out, humidity,
 *         brightness, fan_speed, created_at, cached_at
 *
 * Redis bersifat opsional: kalau `REDIS_URL` kosong / koneksi gagal, semua
 * fungsi mengembalikan null/false dan route akan fallback ke Supabase.
 */

const KEY_PREFIX = "mossifier:latest:";
/** Cache kedaluwarsa 30 hari supaya device yang hilang tidak menumpuk. */
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

const NUMERIC_FIELDS = [
  "air_quality",
  "co2_in",
  "co2_out",
  "humidity",
  "brightness",
  "fan_speed",
] as const;

export type LatestReading = SensorReading & {
  /** Epoch ms kapan baris ini terakhir ditulis ke Redis. */
  cached_at: number;
};

type RedisGlobal = typeof globalThis & {
  __mossifierRedis?: Promise<RedisClientType> | null;
};

const globalForRedis = globalThis as RedisGlobal;

function latestKey(deviceId: string): string {
  return `${KEY_PREFIX}${deviceId}`;
}

/** Client singleton (aman untuk HMR di dev). */
async function getClient(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!globalForRedis.__mossifierRedis) {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: (retries) =>
          retries > 3 ? false : Math.min(retries * 200, 1_000),
      },
    });

    // Jangan pernah log URL (berisi password).
    client.on("error", (error) => {
      console.error("[redis]", error.message);
    });

    globalForRedis.__mossifierRedis = client
      .connect()
      .then(() => client)
      .catch((error) => {
        globalForRedis.__mossifierRedis = null;
        throw error;
      });
  }

  return globalForRedis.__mossifierRedis;
}

function serialize(
  reading: SensorReading,
  cachedAt: number,
): Record<string, string> {
  const record: Record<string, string> = {
    id: reading.id,
    device_id: reading.device_id,
    status: reading.status ?? "",
    created_at: reading.created_at,
    cached_at: String(cachedAt),
  };

  for (const field of NUMERIC_FIELDS) {
    const value = reading[field];
    record[field] = value === null || value === undefined ? "" : String(value);
  }

  return record;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deserialize(hash: Record<string, string>): LatestReading | null {
  const deviceId = hash.device_id?.trim();
  const createdAt = hash.created_at?.trim();
  if (!deviceId || !createdAt || Number.isNaN(Date.parse(createdAt))) {
    return null;
  }

  const cachedAt = Number(hash.cached_at);

  return {
    id: hash.id || `${deviceId}:${createdAt}`,
    device_id: deviceId,
    status: hash.status ? hash.status : null,
    air_quality: toNumber(hash.air_quality),
    co2_in: toNumber(hash.co2_in),
    co2_out: toNumber(hash.co2_out),
    humidity: toNumber(hash.humidity),
    brightness: toNumber(hash.brightness),
    fan_speed: toNumber(hash.fan_speed),
    created_at: createdAt,
    cached_at: Number.isFinite(cachedAt) ? cachedAt : 0,
  };
}

/** Baca pembacaan terakhir dari Redis. `null` kalau kosong / Redis bermasalah. */
export async function getCachedLatest(
  deviceId: string,
): Promise<LatestReading | null> {
  try {
    const client = await getClient();
    if (!client) return null;

    const hash = await client.hGetAll(latestKey(deviceId));
    if (!hash || Object.keys(hash).length === 0) return null;

    return deserialize(hash);
  } catch (error) {
    console.error(
      "[redis] gagal membaca data terakhir:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Simpan pembacaan terbaru ke Redis. `false` kalau Redis tidak tersedia. */
export async function setCachedLatest(reading: SensorReading): Promise<boolean> {
  try {
    const client = await getClient();
    if (!client) return false;

    const key = latestKey(reading.device_id);
    const current = deserialize(await client.hGetAll(key));
    if (
      current &&
      Date.parse(current.created_at) > Date.parse(reading.created_at)
    ) {
      // INSERT Realtime dapat tiba tidak berurutan; jangan timpa data yang baru.
      return true;
    }

    await client
      .multi()
      .hSet(key, serialize(reading, Date.now()))
      .expire(key, CACHE_TTL_SECONDS)
      .exec();

    return true;
  } catch (error) {
    console.error(
      "[redis] gagal menyimpan data terakhir:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
