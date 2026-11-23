import { createClient, type RedisClientType } from "redis";
import type { SensorReading } from "@/lib/sensors";

/**
 * Cache "pembacaan terakhir" per device di Upstash Redis.
 *
 * Key   : `mossifier:latest:<device_id_int>`
 * Field : id, device_id, created_at, plant_status, soil_moisture,
 *         mq135_1, mq135_2, pm1, pm25, pm10, pump, fan, led, cached_at
 */

const KEY_PREFIX = "mossifier:latest:";
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;

const HASH_FIELDS = [
  "plant_status",
  "soil_moisture",
  "mq135_1",
  "mq135_2",
  "pm1",
  "pm25",
  "pm10",
  "fan",
  "led",
] as const;

export type LatestReading = SensorReading & {
  cached_at: number;
};

type RedisGlobal = typeof globalThis & {
  __mossifierRedis?: Promise<RedisClientType> | null;
};

const globalForRedis = globalThis as RedisGlobal;

function latestKey(deviceId: number): string {
  return `${KEY_PREFIX}${deviceId}`;
}

/** Client singleton (aman untuk HMR). */
export async function getRedisClient(): Promise<RedisClientType | null> {
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
    device_id: String(reading.device_id),
    created_at: reading.created_at,
    cached_at: String(cachedAt),
  };

  for (const field of HASH_FIELDS) {
    const value = reading[field as keyof SensorReading];
    record[field] = value === null || value === undefined ? "" : String(value);
  }

  // pump (boolean)
  record.pump =
    reading.pump === null || reading.pump === undefined
      ? ""
      : reading.pump
        ? "1"
        : "0";

  return record;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value: string | undefined): boolean | null {
  if (value === undefined || value === "") return null;
  return value === "1" || value.toLowerCase() === "true";
}

function deserialize(hash: Record<string, string>): LatestReading | null {
  const deviceIdStr = hash.device_id?.trim();
  const createdAt = hash.created_at?.trim();
  if (!deviceIdStr || !createdAt || Number.isNaN(Date.parse(createdAt))) {
    return null;
  }

  const deviceId = Number(deviceIdStr);
  if (!Number.isInteger(deviceId)) return null;

  const cachedAt = Number(hash.cached_at);

  return {
    id: hash.id || `${deviceId}:${createdAt}`,
    device_id: deviceId,
    created_at: createdAt,
    plant_status: toNumber(hash.plant_status),
    soil_moisture: toNumber(hash.soil_moisture),
    mq135_1: toNumber(hash.mq135_1),
    mq135_2: toNumber(hash.mq135_2),
    pm1: toNumber(hash.pm1),
    pm25: toNumber(hash.pm25),
    pm10: toNumber(hash.pm10),
    pump: toBool(hash.pump),
    fan: toNumber(hash.fan),
    led: toNumber(hash.led),
    cached_at: Number.isFinite(cachedAt) ? cachedAt : 0,
  };
}

/** Baca pembacaan terakhir dari Redis berdasarkan device_id (int). */
export async function getCachedLatest(
  deviceId: number,
): Promise<LatestReading | null> {
  try {
    const client = await getRedisClient();
    if (!client) return null;

    const hash = await client.hGetAll(latestKey(deviceId));
    if (!hash || Object.keys(hash).length === 0) return null;

    return deserialize(hash);
  } catch (error) {
    console.error(
      "[redis] gagal membaca:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Simpan pembacaan terbaru ke Redis. */
export async function setCachedLatest(
  reading: SensorReading,
): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (!client) return false;

    const key = latestKey(reading.device_id);
    const current = deserialize(await client.hGetAll(key));
    if (
      current &&
      Date.parse(current.created_at) > Date.parse(reading.created_at)
    ) {
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
      "[redis] gagal menyimpan:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}