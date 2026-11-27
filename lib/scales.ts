/**
 * Skala visual untuk kartu sensor.
 *
 * Tujuannya: satu angka tidak berdiri sendiri — selalu ada posisi pada skala
 * berwarna, label kategori, dan sumber acuannya. Ambang kualitas udara
 * diimpor dari `lib/air-quality.ts` supaya tidak pernah berbeda dengan badge.
 *
 * Catatan sumber (jangan diubah tanpa memperbarui `lib/air-quality.ts`
 * dan `lib/chat/knowledge.ts`):
 * - PM2.5: BMKG / Perban No. 2 Tahun 2022.
 * - PM10: ISPU (Permen LHK No. 14 Tahun 2020).
 * - PM1.0: belum ada baku mutu resmi → memakai ambang PM2.5.
 * - CO₂: ASHRAE/EPA (kualitas udara dalam ruangan), bukan ISPU.
 * - Kelembapan/kipas/LED: target perawatan Mossifier, bukan baku mutu WHO/BMKG.
 */

import {
  AIR_GUIDE,
  CO2_BANDS,
  PM10_BANDS,
  PM1_NOTE,
  PM25_BANDS,
  airLevelLabel,
  type AirLevel,
  type CardTone,
} from "@/lib/air-quality";
import type { SensorKey } from "@/lib/sensors";

export type ScaleBand = {
  from: number;
  /** Batas atas kategori. `Infinity` untuk kategori terbuka terakhir. */
  upTo: number;
  tone: CardTone;
  label: string;
  /** Rentang siap tampil, mis. "0–15 µg/m³" atau "70–90%". */
  range: string;
};

export type SensorScale = {
  min: number;
  /** Batas kanan skala untuk tampilan (bukan batas kategori). */
  max: number;
  unit: string;
  /** Label ujung kanan kalau nilai bisa melewati `max`, mis. "300+ µg/m³". */
  maxLabel?: string;
  bands: ScaleBand[];
  source: string;
  sourceNote: string;
};

type AirGuideKey = "pm25" | "pm10" | "co2";

function airRangeLabel(level: AirLevel, metric: AirGuideKey, unit: string): string {
  const row = AIR_GUIDE.find((item) => item.level === level);
  return `${row?.[metric] ?? "—"}${unit}`;
}

function airScale(
  bands: ReadonlyArray<{ max: number; level: AirLevel }>,
  metric: AirGuideKey,
  options: {
    max: number;
    unit: string;
    maxLabel: string;
    source: string;
    sourceNote: string;
  },
): SensorScale {
  let from = 0;
  return {
    min: 0,
    max: options.max,
    unit: options.unit,
    maxLabel: options.maxLabel,
    bands: bands.map((band) => {
      const next: ScaleBand = {
        from,
        upTo: band.max,
        tone: band.level,
        label: airLevelLabel(band.level),
        range: airRangeLabel(band.level, metric, options.unit),
      };
      from = band.max;
      return next;
    }),
    source: options.source,
    sourceNote: options.sourceNote,
  };
}

const PM25_SCALE = airScale(PM25_BANDS, "pm25", {
  max: 300,
  unit: " µg/m³",
  maxLabel: "300+ µg/m³",
  source: "BMKG / Perban 2/2022",
  sourceNote:
    "Kategori konsentrasi PM2.5 dari BMKG / Perban No. 2 Tahun 2022.",
});

/** PM1.0 memakai ambang PM2.5 karena belum ada baku mutu resmi. */
const PM1_SCALE = airScale(PM25_BANDS, "pm25", {
  max: 300,
  unit: " µg/m³",
  maxLabel: "300+ µg/m³",
  source: "Acuan PM2.5",
  sourceNote: PM1_NOTE,
});

const PM10_SCALE = airScale(PM10_BANDS, "pm10", {
  max: 500,
  unit: " µg/m³",
  maxLabel: "500+ µg/m³",
  source: "ISPU / Permen LHK 14/2020",
  sourceNote:
    "Kategori konsentrasi PM10 dari ISPU (Permen LHK No. 14 Tahun 2020).",
});

const CO2_SCALE = airScale(CO2_BANDS, "co2", {
  max: 2500,
  unit: " ppm",
  maxLabel: "2.500+ ppm",
  source: "ASHRAE/EPA (ruangan)",
  sourceNote:
    "CO₂ bukan parameter ISPU. Ambang ini acuan umum ventilasi ruangan (ASHRAE/EPA), bukan baku mutu kesehatan.",
});

const HUMIDITY_SCALE: SensorScale = {
  min: 0,
  max: 100,
  unit: "%",
  bands: [
    { from: 0, upTo: 50, tone: "unhealthy", label: "Terlalu kering", range: "≤ 50%" },
    { from: 50, upTo: 70, tone: "moderate", label: "Agak kering", range: "50–70%" },
    { from: 70, upTo: 90, tone: "good", label: "Ideal", range: "70–90%" },
    { from: 90, upTo: 100, tone: "moderate", label: "Terlalu basah", range: "> 90%" },
  ],
  source: "Rekomendasi Mossifier",
  sourceNote:
    "Belum ada baku mutu WHO/BMKG untuk kelembapan tanah. Rentang ini target perawatan lumut Mossifier.",
};

const FAN_SCALE: SensorScale = {
  min: 0,
  max: 100,
  unit: "%",
  bands: [
    { from: 0, upTo: 10, tone: "moderate", label: "Hampir mati", range: "≤ 10%" },
    { from: 10, upTo: 70, tone: "good", label: "Aliran pas", range: "10–70%" },
    { from: 70, upTo: 100, tone: "moderate", label: "Terlalu kencang", range: "> 70%" },
  ],
  source: "Rekomendasi Mossifier",
  sourceNote:
    "Tidak ada standar WHO/BMKG untuk kecepatan kipas. Rentang ini rekomendasi perawatan Mossifier.",
};

const BRIGHTNESS_SCALE: SensorScale = {
  min: 0,
  max: 100,
  unit: "%",
  bands: [
    { from: 0, upTo: 10, tone: "moderate", label: "Sangat redup", range: "≤ 10%" },
    { from: 10, upTo: 80, tone: "good", label: "Cahaya layak", range: "10–80%" },
    { from: 80, upTo: 100, tone: "moderate", label: "Terlalu terang/panas", range: "> 80%" },
  ],
  source: "Rekomendasi Mossifier",
  sourceNote:
    "Tidak ada standar WHO/BMKG untuk kecerahan lampu tanam. Rentang ini rekomendasi perawatan Mossifier.",
};

/** Skala untuk satu jenis sensor. Null = tidak punya skala (status/pompa). */
export function sensorScale(key: SensorKey): SensorScale | null {
  switch (key) {
    case "co2_in":
    case "co2_out":
      return CO2_SCALE;
    case "pm1":
      return PM1_SCALE;
    case "pm25":
      return PM25_SCALE;
    case "pm10":
      return PM10_SCALE;
    case "humidity":
      return HUMIDITY_SCALE;
    case "fan_speed":
      return FAN_SCALE;
    case "brightness":
      return BRIGHTNESS_SCALE;
    default:
      return null;
  }
}

/** Kategori (band) yang cocok untuk sebuah nilai. */
export function scaleBand(
  key: SensorKey,
  value: number | null | undefined,
): ScaleBand | null {
  const scale = sensorScale(key);
  if (!scale || typeof value !== "number" || !Number.isFinite(value)) return null;

  return (
    scale.bands.find((band) => value <= band.upTo) ??
    scale.bands[scale.bands.length - 1] ??
    null
  );
}
