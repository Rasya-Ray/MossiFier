/**
 * Tipe + helper data sensor. Sumber data: tabel `devices` di Supabase.
 * Setiap baris = satu kiriman ESP32 (riwayat), bukan satu perangkat unik.
 */

import { formatPlantStatus } from "@/lib/labels";

export const SENSOR_KEYS = [
  "air_quality",
  "co2_in",
  "co2_out",
  "humidity",
  "brightness",
  "fan_speed",
] as const;

export type SensorKey = (typeof SENSOR_KEYS)[number];

/** Kolom yang bisa ditampilkan di halaman detail (termasuk status tanaman). */
export type SensorFieldKey = SensorKey | "status";

export type SensorReading = {
  id: string;
  device_id: string;
  status: string | null;
  air_quality: number | null;
  co2_in: number | null;
  co2_out: number | null;
  humidity: number | null;
  brightness: number | null;
  fan_speed: number | null;
  created_at: string;
};

/** Kolom yang di-select dari Supabase (urutan tetap, biar payload kecil). */
export const SENSOR_COLUMNS =
  "id, device_id, status, air_quality, co2_in, co2_out, humidity, brightness, fan_speed, created_at";

export const SENSOR_LABELS: Record<SensorFieldKey, string> = {
  air_quality: "Kualitas Udara",
  co2_in: "CO₂ Dalam Ruangan",
  co2_out: "CO₂ Luar Ruangan",
  humidity: "Kelembapan",
  brightness: "Kecerahan LED",
  fan_speed: "Kecepatan Fan",
  status: "Status Tanaman",
};

export const SENSOR_DESCRIPTIONS: Record<SensorFieldKey, string> = {
  air_quality: "Tingkat kualitas udara yang dibaca sensor.",
  co2_in: "Kadar CO₂ di dalam ruangan.",
  co2_out: "Kadar CO₂ di luar ruangan.",
  humidity: "Kelembapan udara di sekitar tanaman.",
  brightness: "Tingkat kecerahan lampu LED.",
  fan_speed: "Kecepatan kipas sirkulasi udara.",
  status: "Kondisi tanaman: 1 = Sehat, 2 = Sakit, 3 = Mati.",
};

export const SENSOR_UNITS: Partial<Record<SensorFieldKey, string>> = {
  co2_in: "ppm",
  co2_out: "ppm",
  humidity: "%",
};

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

/** Ambil nilai mentah satu kolom dari sebuah baris. */
export function readingValue(
  reading: SensorReading | null | undefined,
  key: SensorFieldKey,
): number | string | null {
  if (!reading) return null;
  if (key === "status") return reading.status;
  return reading[key];
}

/** Ambil nilai numerik untuk grafik (null kalau kosong / bukan angka). */
export function historyValues(
  readings: SensorReading[],
  key: SensorFieldKey,
): Array<number | null> {
  if (key === "status") return readings.map(() => null);
  return readings.map((reading) => {
    const value = reading[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  });
}

/** Format tampilan nilai (angka + satuan, atau label status tanaman). */
export function formatSensorValue(
  value: number | string | null | undefined,
  key: SensorFieldKey,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "status") return formatPlantStatus(String(value));

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  const unit = SENSOR_UNITS[key];
  return unit
    ? `${numberFormatter.format(numeric)} ${unit}`
    : numberFormatter.format(numeric);
}
