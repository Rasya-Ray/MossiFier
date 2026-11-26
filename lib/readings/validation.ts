/**
 * Validasi baris sensor dari Supabase/webhook sebelum di-cache ke Redis.
 * Sesuai skema baru: satu baris per kiriman di tabel `devices`.
 */

import type { SensorReading } from "@/lib/sensors";

const NUMERIC_FIELDS = [
  "co2_in",
  "co2_out",
  "humidity",
  "brightness",
  "fan_speed",
  "pm1",
  "pm25",
  "pm10",
] as const;

const STATUS_VALUES = ["HEALTHY", "STRESSED", "CRITICAL"];

export function parseReading(value: unknown): SensorReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;

  // id & created_at wajib
  if (
    typeof row.id !== "number" ||
    !Number.isInteger(row.id) ||
    row.id <= 0 ||
    typeof row.created_at !== "string" ||
    Number.isNaN(Date.parse(row.created_at))
  ) {
    return null;
  }

  // device_id wajib string MOSS-...
  if (typeof row.device_id !== "string" || row.device_id.length === 0) return null;

  // status: null atau teks HEALTHY/STRESSED/CRITICAL
  const status = row.status;
  if (status !== null && status !== undefined) {
    if (typeof status !== "string" || !STATUS_VALUES.includes(status)) {
      return null;
    }
  }

  // numeric fields: null atau number finite
  for (const field of NUMERIC_FIELDS) {
    const v = row[field];
    if (v !== null && v !== undefined) {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
    }
  }

  // pump: null atau boolean
  const pump = row.pump;
  if (pump !== null && pump !== undefined && typeof pump !== "boolean") {
    return null;
  }

  return {
    id: row.id,
    device_id: row.device_id,
    created_at: row.created_at,
    status: status ?? null,
    co2_in:
      row.co2_in !== null && row.co2_in !== undefined
        ? Number(row.co2_in)
        : null,
    co2_out:
      row.co2_out !== null && row.co2_out !== undefined
        ? Number(row.co2_out)
        : null,
    humidity:
      row.humidity !== null && row.humidity !== undefined
        ? Number(row.humidity)
        : null,
    brightness:
      row.brightness !== null && row.brightness !== undefined
        ? Number(row.brightness)
        : null,
    fan_speed:
      row.fan_speed !== null && row.fan_speed !== undefined
        ? Number(row.fan_speed)
        : null,
    pump: pump ?? null,
    pm1: row.pm1 !== null && row.pm1 !== undefined ? Number(row.pm1) : null,
    pm25: row.pm25 !== null && row.pm25 !== undefined ? Number(row.pm25) : null,
    pm10: row.pm10 !== null && row.pm10 !== undefined ? Number(row.pm10) : null,
  };
}
