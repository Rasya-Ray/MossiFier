/**
 * Kategori kualitas udara untuk dashboard.
 *
 * Acuan:
 * - PM2.5: kategori BMKG / Perban No. 2 Tahun 2022 (konsentrasi per jam).
 *   0–15 Baik, 16–65 Sedang, 66–150 Tidak Sehat, 151–250 Sangat Tidak Sehat, >250 Berbahaya.
 * - PM10: ISPU (Permen LHK No. 14 Tahun 2020).
 *   0–50 Baik, 51–150 Sedang, 151–350 Tidak Sehat, 351–420 Sangat Tidak Sehat, >420 Berbahaya.
 * - PM1.0: belum ada baku mutu resmi. Dinilai memakai ambang PM2.5 sebagai
 *   acuan pendukung (PM1.0 adalah bagian dari PM2.5, jadi ambangnya konservatif).
 * - CO₂: acuan umum kualitas udara dalam ruangan (ASHRAE/EPA), bukan ISPU.
 *   ≤800 Baik, 801–1.000 Sedang, 1.001–1.500 Tidak Sehat,
 *   1.501–2.000 Sangat Tidak Sehat, >2.000 Berbahaya.
 *
 * Status udara keseluruhan = kategori terburuk dari semua parameter yang ada.
 */

import type { PublicSensorReading, SensorKey } from "@/lib/sensors";

export type AirLevel =
  | "good"
  | "moderate"
  | "unhealthy"
  | "veryUnhealthy"
  | "hazardous";

export type CardTone = AirLevel | "neutral";

export type AirCategory = {
  level: AirLevel;
  label: string;
  /** Saran singkat untuk kartu. */
  short: string;
  /** Penjelasan satu kalimat untuk banner/insight. */
  advice: string;
};

const CATEGORY: Record<AirLevel, AirCategory> = {
  good: {
    level: "good",
    label: "Baik",
    short: "Aman untuk semua orang.",
    advice: "Udara bersih. Aman untuk aktivitas di dalam maupun luar ruangan.",
  },
  moderate: {
    level: "moderate",
    label: "Sedang",
    short: "Kelompok sensitif perlu waspada.",
    advice:
      "Kualitas udara masih bisa diterima. Kelompok sensitif (anak, lansia, penderita asma) sebaiknya mengurangi aktivitas luar yang berat.",
  },
  unhealthy: {
    level: "unhealthy",
    label: "Tidak Sehat",
    short: "Kurangi aktivitas luar ruangan.",
    advice:
      "Udara mulai tidak sehat. Kurangi aktivitas luar, tutup jendela, dan pakai masker bila perlu.",
  },
  veryUnhealthy: {
    level: "veryUnhealthy",
    label: "Sangat Tidak Sehat",
    short: "Hindari aktivitas luar ruangan.",
    advice:
      "Udara sangat tidak sehat. Tetap di dalam ruangan, tutup jendela, dan nyalakan penyaring udara bila ada.",
  },
  hazardous: {
    level: "hazardous",
    label: "Berbahaya",
    short: "Tetap di dalam ruangan.",
    advice:
      "Udara berbahaya. Hindari keluar rumah, tutup ventilasi, dan pakai masker bila harus keluar.",
  },
};

/** Saran khusus CO₂: masalahnya ventilasi, jadi jangan "tutup jendela". */
export const CO2_GUIDANCE: Record<
  AirLevel,
  { short: string; advice: string }
> = {
  good: {
    short: "Kadar CO₂ segar.",
    advice: "Ventilasi cukup. Tidak perlu tindakan khusus.",
  },
  moderate: {
    short: "Mulai pengap — buka ventilasi.",
    advice: "Buka jendela atau ventilasi supaya udara segar masuk.",
  },
  unhealthy: {
    short: "Pengap — buka ventilasi sekarang.",
    advice:
      "Buka jendela/pintu dan kurangi jumlah orang di ruangan. Nyalakan kipas.",
  },
  veryUnhealthy: {
    short: "Sangat pengap — aliri udara segar.",
    advice:
      "Segera buka ventilasi atau keluar sebentar sampai kadar CO₂ turun.",
  },
  hazardous: {
    short: "Berbahaya — tinggalkan ruangan.",
    advice:
      "Tinggalkan ruangan, buka ventilasi lebar-lebar, dan cari udara segar.",
  },
};

const SEVERITY: Record<AirLevel, number> = {
  good: 0,
  moderate: 1,
  unhealthy: 2,
  veryUnhealthy: 3,
  hazardous: 4,
};

type Band = { max: number; level: AirLevel };

const PM25_BANDS: Band[] = [
  { max: 15, level: "good" },
  { max: 65, level: "moderate" },
  { max: 150, level: "unhealthy" },
  { max: 250, level: "veryUnhealthy" },
  { max: Number.POSITIVE_INFINITY, level: "hazardous" },
];

const PM10_BANDS: Band[] = [
  { max: 50, level: "good" },
  { max: 150, level: "moderate" },
  { max: 350, level: "unhealthy" },
  { max: 420, level: "veryUnhealthy" },
  { max: Number.POSITIVE_INFINITY, level: "hazardous" },
];

const CO2_BANDS: Band[] = [
  { max: 800, level: "good" },
  { max: 1000, level: "moderate" },
  { max: 1500, level: "unhealthy" },
  { max: 2000, level: "veryUnhealthy" },
  { max: Number.POSITIVE_INFINITY, level: "hazardous" },
];

function categorize(
  value: number | null | undefined,
  bands: Band[],
): AirCategory | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const band = bands.find((item) => value <= item.max) ?? bands[bands.length - 1];
  return band ? CATEGORY[band.level] : null;
}

export function pm25Category(value: number | null | undefined): AirCategory | null {
  return categorize(value, PM25_BANDS);
}

export function pm10Category(value: number | null | undefined): AirCategory | null {
  return categorize(value, PM10_BANDS);
}

/** PM1.0 tidak punya baku mutu resmi → pakai ambang PM2.5. */
export function pm1Category(value: number | null | undefined): AirCategory | null {
  return categorize(value, PM25_BANDS);
}

export function co2Category(value: number | null | undefined): AirCategory | null {
  return categorize(value, CO2_BANDS);
}

export const PM1_NOTE =
  "PM1.0 belum punya baku mutu resmi. Kategorinya memakai ambang PM2.5 sebagai acuan pendukung.";

export const AIR_SOURCE_NOTE =
  "Acuan: ISPU (Permen LHK No. 14/2020) dan BMKG untuk PM2.5/PM10; ASHRAE/EPA untuk CO₂ dalam ruangan.";

export type AirMetric = "pm25" | "pm10" | "co2";

export const AIR_GUIDE = [
  { level: "good", label: "Baik", pm25: "0–15", pm10: "0–50", co2: "≤ 800" },
  { level: "moderate", label: "Sedang", pm25: "16–65", pm10: "51–150", co2: "801–1.000" },
  { level: "unhealthy", label: "Tidak Sehat", pm25: "66–150", pm10: "151–350", co2: "1.001–1.500" },
  { level: "veryUnhealthy", label: "Sangat Tidak Sehat", pm25: "151–250", pm10: "351–420", co2: "1.501–2.000" },
  { level: "hazardous", label: "Berbahaya", pm25: "> 250", pm10: "> 420", co2: "> 2.000" },
] as const satisfies ReadonlyArray<{
  level: AirLevel;
  label: string;
  pm25: string;
  pm10: string;
  co2: string;
}>;

/** Rentang angka untuk ditampilkan di kartu sensor. */
export function airRange(metric: AirMetric, level: AirLevel): string {
  const row = AIR_GUIDE.find((item) => item.level === level);
  if (!row) return "—";
  if (metric === "pm25") return `${row.pm25} µg/m³`;
  if (metric === "pm10") return `${row.pm10} µg/m³`;
  return `${row.co2} ppm`;
}

export type OverallAirQuality = AirCategory & {
  driverKey: SensorKey;
  driverLabel: string;
  driverValue: number;
  metric: "pm" | "co2";
};

type Driver = {
  key: SensorKey;
  label: string;
  metric: "pm" | "co2";
  category: (reading: PublicSensorReading) => AirCategory | null;
};

const DRIVERS: Driver[] = [
  { key: "pm25", label: "PM2.5", metric: "pm", category: (r) => pm25Category(r.pm25) },
  { key: "pm10", label: "PM10", metric: "pm", category: (r) => pm10Category(r.pm10) },
  { key: "pm1", label: "PM1.0", metric: "pm", category: (r) => pm1Category(r.pm1) },
  { key: "co2_in", label: "CO₂ In", metric: "co2", category: (r) => co2Category(r.co2_in) },
  { key: "co2_out", label: "CO₂ Out", metric: "co2", category: (r) => co2Category(r.co2_out) },
];

/**
 * Kategori udara keseluruhan dari parameter terburuk.
 * Saran disesuaikan dengan penyebab terburuk: PM → hindari polusi,
 * CO₂ → buka ventilasi.
 */
export function overallAirQuality(
  reading: PublicSensorReading | null | undefined,
): OverallAirQuality | null {
  if (!reading) return null;

  let worst: {
    category: AirCategory;
    key: SensorKey;
    label: string;
    metric: "pm" | "co2";
    value: number;
  } | null = null;

  for (const driver of DRIVERS) {
    const category = driver.category(reading);
    const raw = reading[driver.key];
    if (!category || typeof raw !== "number" || !Number.isFinite(raw)) continue;

    if (!worst || SEVERITY[category.level] > SEVERITY[worst.category.level]) {
      worst = {
        category,
        key: driver.key,
        label: driver.label,
        metric: driver.metric,
        value: raw,
      };
    }
  }

  if (!worst) return null;

  const guidance =
    worst.metric === "co2"
      ? CO2_GUIDANCE[worst.category.level]
      : { short: worst.category.short, advice: worst.category.advice };

  return {
    ...worst.category,
    ...guidance,
    driverKey: worst.key,
    driverLabel: worst.label,
    driverValue: worst.value,
    metric: worst.metric,
  };
}
