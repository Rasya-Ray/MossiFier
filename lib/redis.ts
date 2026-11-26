import { createClient, type RedisClientType } from "redis";
import type { SensorReading } from "@/lib/sensors";

/**
 * Cache "pembacaan terakhir" per device di Upstash Redis.
 *
 * Key   : `mossifier:latest:v2:<device_id>` (device_id = "MOSS-B0A7322B0960").
 *         Awalan `v2` sengaja dipakai agar cache skema lama tidak terbaca.
 * Field : id, device_id, created_at, status,
 *         co2_in, co2_out, humidity, brightness, fan_speed, pump,
 *         pm1, pm25, pm10, cached_at
 */

const KEY_PREFIX = "mossifier:latest:v2:";
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

const HASH_FIELDS = [
  "status",
  "co2_in",
  "co2_out",
  "humidity",
  "brightness",
  "fan_speed",
  "pump",
  "pm1",
  "pm25",
  "pm10",
] as const;

export type LatestReading = SensorReading & {
  cached_at: number;
};

type RedisGlobal = typeof globalThis & {
  __mossifierRedis?: Promise<RedisClientType> | null;
};

const globalForRedis = globalThis as RedisGlobal;

function latestKey(deviceId: string): string {
  return `${KEY_PREFIX}${deviceId}`;
}

/** Client singleton (aman untuk HMR). Gagal connect → null agar API tetap jalan. */
export async function getRedisClient(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL?.replace(/^["']|["']$/g, "").trim();
  if (!url) return null;

  try {
    if (!globalForRedis.__mossifierRedis) {
      globalForRedis.__mossifierRedis = createClient({ url }).connect();
    }
    return await globalForRedis.__mossifierRedis;
  } catch (error) {
    console.error(
      "[redis] gagal terhubung:",
      error instanceof Error ? error.message : error,
    );
    globalForRedis.__mossifierRedis = null;
    return null;
  }
}

/** Baca cache terakhir per device. */
export async function getCachedLatest(
  deviceId: string,
): Promise<LatestReading | null> {
  const client = await getRedisClient();
  if (!client) return null;

  try {
    const hash = await client.hGetAll(latestKey(deviceId));
    if (!hash || Object.keys(hash).length === 0) return null;

    // Tolak cache skema lama: `id` harus integer positif dan created_at valid.
    const id = Number(hash.id);
    const createdAt = hash.created_at;
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      typeof createdAt !== "string" ||
      Number.isNaN(Date.parse(createdAt))
    ) {
      return null;
    }

    return {
      id,
      device_id: hash.device_id,
      created_at: createdAt,
      status: hash.status ?? null,
      co2_in: toNumber(hash.co2_in),
      co2_out: toNumber(hash.co2_out),
      humidity: toNumber(hash.humidity),
      brightness: toNumber(hash.brightness),
      fan_speed: toNumber(hash.fan_speed),
      pump: hash.pump === "true",
      pm1: toNumber(hash.pm1),
      pm25: toNumber(hash.pm25),
      pm10: toNumber(hash.pm10),
      cached_at: Number(hash.cached_at ?? 0),
    };
  } catch {
    return null;
  }
}

/** Tulis cache terakhir per device. */
export async function setCachedLatest(
  reading: SensorReading,
): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;

  const cached_at = Date.now();
  const fields: Record<string, string> = {
    id: String(reading.id),
    device_id: reading.device_id,
    created_at: reading.created_at,
    status: reading.status ?? "",
    co2_in: reading.co2_in != null ? String(reading.co2_in) : "",
    co2_out: reading.co2_out != null ? String(reading.co2_out) : "",
    humidity: reading.humidity != null ? String(reading.humidity) : "",
    brightness: reading.brightness != null ? String(reading.brightness) : "",
    fan_speed: reading.fan_speed != null ? String(reading.fan_speed) : "",
    pump: String(reading.pump ?? false),
    pm1: reading.pm1 != null ? String(reading.pm1) : "",
    pm25: reading.pm25 != null ? String(reading.pm25) : "",
    pm10: reading.pm10 != null ? String(reading.pm10) : "",
    cached_at: String(cached_at),
  };

  try {
    await client.hSet(latestKey(reading.device_id), fields);
    await client.expire(latestKey(reading.device_id), CACHE_TTL_SECONDS);
    return true;
  } catch {
    return false;
  }
}

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
