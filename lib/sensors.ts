/**
 * Tipe + helper data sensor (tabel `devices` tunggal).
 * Setiap POST ESP32 = 1 baris baru; kolom sesuai payload ESP32 langsung.
 */

import { plantStatusText } from "@/lib/labels";

export const SENSOR_KEYS = [
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

export type SensorKey = (typeof SENSOR_KEYS)[number];

export type SensorReading = {
  /** id integer internal — tidak dikirim ke browser. */
  id: number;
  device_id: string;
  created_at: string;
  status: string | null;
  co2_in: number | null;
  co2_out: number | null;
  humidity: number | null;
  brightness: number | null;
  fan_speed: number | null;
  pump: boolean | null;
  /** Nilai partikulat PM dari ESP32 (bisa null kalau belum ada data). */
  pm1: number | null;
  pm25: number | null;
  pm10: number | null;
};

/** Kolom yang di-select dari Supabase (urutan tabel devices). */
export const SENSOR_COLUMNS =
  "id, device_id, created_at, status, co2_in, co2_out, humidity, brightness, fan_speed, pump, pm1, pm25, pm10";

export const SENSOR_LABELS: Record<SensorKey, string> = {
  status: "Status Tanaman",
  co2_in: "CO₂ In",
  co2_out: "CO₂ Out",
  humidity: "Kelembapan Tanah",
  brightness: "Kecerahan LED",
  fan_speed: "Kecepatan Fan",
  pump: "Pompa",
  pm1: "PM1.0",
  pm25: "PM2.5",
  pm10: "PM10",
};

export const SENSOR_DESCRIPTIONS: Record<SensorKey, string> = {
  status: "Kondisi lumut menurut perangkat: Sehat, Sakit, atau Mati.",
  co2_in: "Tingkat gas CO₂ di dalam ruangan. Makin rendah, udaranya makin segar.",
  co2_out: "Tingkat gas CO₂ di luar ruangan sebagai pembanding.",
  humidity: "Basah atau keringnya tanah lumut (%). Idealnya 70–90%.",
  brightness: "Seberapa terang lampu LED menyala (0–100%).",
  fan_speed: "Seberapa kencang kipas bekerja (0–100%).",
  pump: "Apakah pompa air sedang menyala atau mati.",
  pm1: "Debu sangat halus di udara. Makin rendah, makin aman untuk pernapasan.",
  pm25: "Debu halus yang mudah masuk ke paru-paru. Makin rendah makin aman.",
  pm10: "Debu kasar di udara. Makin rendah makin aman untuk pernapasan.",
};

export const SENSOR_UNITS: Partial<Record<SensorKey, string>> = {
  co2_in: "ppm",
  co2_out: "ppm",
  humidity: "%",
  brightness: "%",
  fan_speed: "%",
  pm1: "µg/m³",
  pm25: "µg/m³",
  pm10: "µg/m³",
};

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

/** Ambil nilai mentah satu kolom dari sebuah baris. */
export function readingValue(
  reading: PublicSensorReading | SensorReading | null | undefined,
  key: SensorKey,
): number | boolean | string | null {
  if (!reading) return null;
  return reading[key];
}

/** Ambil nilai numerik untuk grafik (boolean → 0/1). */
export function historyValues(
  readings: Array<PublicSensorReading | SensorReading>,
  key: SensorKey,
): Array<number | null> {
  return readings.map((reading) => {
    const value = reading[key];
    if (typeof value === "boolean") return value ? 1 : 0;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  });
}

/** Format tampilan nilai (angka + satuan, teks status, atau boolean). */
export function formatSensorValue(
  value: number | boolean | string | null | undefined,
  key: SensorKey,
): string {
  if (value === null || value === undefined) return "—";

  if (key === "status") {
    return plantStatusText(value as string | number | null | undefined);
  }
  if (key === "pump" || typeof value === "boolean") {
    return value ? "Menyala" : "Mati";
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  const formatter = numberFormatter;
  const unit = SENSOR_UNITS[key];
  return unit
    ? `${formatter.format(numeric)} ${unit}`
    : formatter.format(numeric);
}

/** Versi aman untuk browser — tanpa `id` dan `device_id` internal. */
export type PublicSensorReading = Omit<SensorReading, "id" | "device_id">;

/** Sumber pembacaan terakhir pada endpoint cache. */
export type LatestReadingSource = "redis" | "supabase" | "none";

/** Respons `GET /api/readings/latest`. */
export type LatestReadingResponse = {
  reading: PublicSensorReading | null;
  deviceId: string | null;
  source: LatestReadingSource;
  cachedAt: number | null;
};
