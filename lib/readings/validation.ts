/**
 * Validasi baris sensor dari Supabase/webhook sebelum di-cache ke Redis.
 * Kolom menyesuaikan skema baru (tabel `sensor_readings`).
 */

import type { SensorReading } from "@/lib/sensors";

const NUMERIC_FIELDS = [
  "vision_conf",
  "soil_moisture",
  "soil_raw",
  "mq135_1",
  "mq135_2",
  "pm1",
  "pm25",
  "pm10",
  "fan",
  "led",
] as const;

export function parseReading(value: unknown): SensorReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  // id UUID & created_at wajib
  if (
    typeof row.id !== "string" ||
    typeof row.created_at !== "string" ||
    Number.isNaN(Date.parse(row.created_at))
  ) {
    return null;
  }

  // device_id wajib integer
  const deviceId = Number(row.device_id);
  if (!Number.isInteger(deviceId) || deviceId <= 0) return null;

  // Numeric fields: null atau number finite
  for (const field of NUMERIC_FIELDS) {
    const v = row[field];
    if (v !== null && v !== undefined) {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
    }
  }

  // plant_status: null atau integer 0-2
  const ps = row.plant_status;
  if (
    ps !== null &&
    ps !== undefined &&
    (!Number.isInteger(ps) || (ps as number) < 0 || (ps as number) > 2)
  ) {
    return null;
  }

  // pump: null atau boolean
  if (row.pump !== null && row.pump !== undefined && typeof row.pump !== "boolean") {
    return null;
  }

  return {
    id: row.id as string,
    device_id: deviceId,
    created_at: row.created_at as string,
    plant_status: row.plant_status != null ? (Number(row.plant_status) as 0 | 1 | 2) : null,
    vision_conf: row.vision_conf != null ? Number(row.vision_conf) : null,
    soil_moisture: row.soil_moisture != null ? Number(row.soil_moisture) : null,
    soil_raw: row.soil_raw != null ? Number(row.soil_raw) : null,
    mq135_1: row.mq135_1 != null ? Number(row.mq135_1) : null,
    mq135_2: row.mq135_2 != null ? Number(row.mq135_2) : null,
    pm1: row.pm1 != null ? Number(row.pm1) : null,
    pm25: row.pm25 != null ? Number(row.pm25) : null,
    pm10: row.pm10 != null ? Number(row.pm10) : null,
    pump: row.pump === true || row.pump === false ? row.pump : null,
    fan: row.fan != null ? Number(row.fan) : null,
    led: row.led != null ? Number(row.led) : null,
  };
}