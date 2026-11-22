import type { PublicSensorReading } from "@/lib/sensors";

/**
 * Cache pembacaan terakhir per device di localStorage.
 * Tujuan: saat halaman dibuka ulang / koneksi putus, dashboard tetap menampilkan
 * data terakhir yang diketahui (bukan "belum ada data").
 * Cache hanya untuk tampilan; sumber kebenaran tetap `sensor_readings`.
 */
const STORAGE_PREFIX = "mossifier.last_readings";
const MAX_ROWS = 20;

type CachedReadings = {
  savedAt: number;
  readings: PublicSensorReading[];
};

function storageKey(deviceId: string): string {
  return `${STORAGE_PREFIX}.${deviceId}`;
}

/** Baca cache; `null` kalau tidak ada / rusak / milik device lain. */
export function readCachedReadings(deviceId: string): CachedReadings | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey(deviceId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CachedReadings> | null;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (!Array.isArray(parsed.readings)) return null;

    const readings = parsed.readings
      .filter((row) => Boolean(row?.id) && typeof row?.created_at === "string")
      .slice(-MAX_ROWS);

    if (readings.length === 0) return null;
    return { savedAt: parsed.savedAt, readings };
  } catch {
    return null;
  }
}

export function writeCachedReadings(
  deviceId: string,
  readings: PublicSensorReading[],
): void {
  if (typeof window === "undefined" || readings.length === 0) return;

  try {
    window.localStorage.setItem(
      storageKey(deviceId),
      JSON.stringify({
        savedAt: Date.now(),
        readings: readings.slice(-MAX_ROWS),
      }),
    );
  } catch {
    // localStorage penuh / diblokir: abaikan, data live tetap jalan.
  }
}
