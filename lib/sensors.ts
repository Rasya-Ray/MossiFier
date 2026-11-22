/**
 * Tipe + helper data sensor baru (tabel `sensor_readings`).
 * Setiap baris = satu kiriman ESP32 (riwayat).
 */

import { plantStatusText } from "@/lib/labels";

export const SENSOR_KEYS = [
  "plant_status",
  "vision_conf",
  "soil_moisture",
  "soil_raw",
  "mq135_1",
  "mq135_2",
  "pm1",
  "pm25",
  "pm10",
  "pump",
  "fan",
  "led",
] as const;

export type SensorKey = (typeof SENSOR_KEYS)[number];

/** Kolom yang bisa ditampilkan di halaman detail. */
export type SensorFieldKey = SensorKey;

export type SensorReading = {
  id: string;
  /** FK integer ke devices.id — dipetakan lewat MAC di sisi server. */
  device_id: number;
  created_at: string;
  plant_status: number | null;
  vision_conf: number | null;
  soil_moisture: number | null;
  soil_raw: number | null;
  mq135_1: number | null;
  mq135_2: number | null;
  pm1: number | null;
  pm25: number | null;
  pm10: number | null;
  pump: boolean | null;
  /** Persentase kecepatan kipas 0–100 */
  fan: number | null;
  /** Persentase kecerahan LED 0–100 */
  led: number | null;
};

/** Kolom yang di-select dari Supabase (urutan tabel sensor_readings). */
export const SENSOR_COLUMNS =
  "id, device_id, created_at, plant_status, vision_conf, soil_moisture, soil_raw, mq135_1, mq135_2, pm1, pm25, pm10, pump, fan, led";

export const SENSOR_LABELS: Record<SensorFieldKey, string> = {
  plant_status: "Status Tanaman",
  vision_conf: "Confidence AI",
  soil_moisture: "Kelembapan Tanah",
  soil_raw: "Soil Raw",
  mq135_1: "MQ-135 #1",
  mq135_2: "MQ-135 #2",
  pm1: "PM1.0",
  pm25: "PM2.5",
  pm10: "PM10",
  pump: "Pompa",
  fan: "Kecepatan Fan",
  led: "Kecerahan LED",
};

export const SENSOR_DESCRIPTIONS: Record<SensorFieldKey, string> = {
  plant_status: "Hasil klasifikasi AI: 0 = Sehat, 1 = Sakit, 2 = Mati.",
  vision_conf: "Skor keyakinan AI terhadap klasifikasi tanaman (0–1).",
  soil_moisture: "Kelembapan tanah dalam persentase. Lumut nyaman di 70–90%.",
  soil_raw: "Nilai mentah sensor kelembapan tanah (ADC).",
  mq135_1: "Pembacaan sensor gas MQ-135 pertama (kualitas udara).",
  mq135_2: "Pembacaan sensor gas MQ-135 kedua (redundan).",
  pm1: "Partikel udara < 1 µm (PM1.0).",
  pm25: "Partikel udara < 2.5 µm (PM2.5), paling berbahaya bagi paru-paru.",
  pm10: "Partikel udara < 10 µm (PM10).",
  pump: "Status pompa air: menyala atau mati.",
  fan: "Kecepatan kipas dalam persentase (0–100).",
  led: "Kecerahan lampu LED dalam persentase (0–100).",
};

export const SENSOR_UNITS: Partial<Record<SensorFieldKey, string>> = {
  soil_moisture: "%",
  fan: "%",
  led: "%",
};

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

/** confidence AI butuh 2 angka desimal (0,95 jangan dibulatkan jadi 1). */
const confidenceFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

/** Ambil nilai mentah satu kolom dari sebuah baris. */
export function readingValue(
  reading: PublicSensorReading | SensorReading | null | undefined,
  key: SensorFieldKey,
): number | boolean | null {
  if (!reading) return null;
  return reading[key];
}

/** Ambil nilai numerik untuk grafik (boolean → 0/1). */
export function historyValues(
  readings: Array<PublicSensorReading | SensorReading>,
  key: SensorFieldKey,
): Array<number | null> {
  return readings.map((reading) => {
    const value = reading[key];
    if (typeof value === "boolean") return value ? 1 : 0;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  });
}

/** Format tampilan nilai (angka + satuan, teks status, atau boolean). */
export function formatSensorValue(
  value: number | boolean | null | undefined,
  key: SensorFieldKey,
): string {
  if (value === null || value === undefined) return "—";

  if (key === "plant_status") {
    return plantStatusText(typeof value === "boolean" ? Number(value) : value);
  }
  if (key === "pump" || typeof value === "boolean") {
    return value ? "Menyala" : "Mati";
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  const formatter = key === "vision_conf" ? confidenceFormatter : numberFormatter;
  const unit = SENSOR_UNITS[key];
  return unit
    ? `${formatter.format(numeric)} ${unit}`
    : formatter.format(numeric);
}

/** Versi aman untuk browser — tanpa `device_id` internal. */
export type PublicSensorReading = Omit<SensorReading, "device_id">;

/** Sumber pembacaan terakhir pada endpoint cache. */
export type LatestReadingSource = "redis" | "supabase" | "none";

/** Respons `GET /api/readings/latest`. */
export type LatestReadingResponse = {
  reading: PublicSensorReading | null;
  macAddress: string | null;
  source: LatestReadingSource;
  cachedAt: number | null;
};