import { isValidDeviceId } from "@/lib/chat/sensor-context";
import type { SensorReading } from "@/lib/sensors";

/** Validate a row from Supabase before caching it as the latest reading. */
export function parseReading(value: unknown): SensorReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    !isValidDeviceId(row.device_id) ||
    typeof row.created_at !== "string" ||
    Number.isNaN(Date.parse(row.created_at))
  ) {
    return null;
  }

  const numericFields = [
    "air_quality",
    "co2_in",
    "co2_out",
    "humidity",
    "brightness",
    "fan_speed",
  ] as const;

  for (const field of numericFields) {
    const fieldValue = row[field];
    if (
      fieldValue !== null &&
      (typeof fieldValue !== "number" || !Number.isFinite(fieldValue))
    ) {
      return null;
    }
  }

  if (row.status !== null && typeof row.status !== "string") return null;

  return {
    id: row.id,
    device_id: row.device_id,
    status: row.status,
    air_quality: row.air_quality,
    co2_in: row.co2_in,
    co2_out: row.co2_out,
    humidity: row.humidity,
    brightness: row.brightness,
    fan_speed: row.fan_speed,
    created_at: row.created_at,
  } as SensorReading;
}
