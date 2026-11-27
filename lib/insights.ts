/**
 * Penjelasan "manusiawi" dari data sensor untuk dashboard.
 * Fungsi murni (tanpa Date.now / akses browser): waktu selalu dikirim dari luar.
 * Ambang batas sengaja sama dengan pengetahuan chatbot (lib/chat/knowledge.ts)
 * supaya dashboard dan Kibo tidak saling bertentangan.
 */

import {
  CO2_GUIDANCE,
  co2Category,
  overallAirQuality,
  pm1Category,
  pm10Category,
  pm25Category,
  type CardTone,
} from "@/lib/air-quality";
import { scaleBand } from "@/lib/scales";
import { formatSensorValue, type PublicSensorReading, type SensorKey } from "@/lib/sensors";
import { plantStatusText, plantStatusTone } from "@/lib/labels";

export type InsightTone = "good" | "info" | "warn" | "bad";

export type Insight = {
  id: string;
  tone: InsightTone;
  title: string;
  text: string;
};

export const TONE_LABEL: Record<InsightTone, string> = {
  good: "Baik",
  info: "Info",
  warn: "Perhatian",
  bad: "Perlu tindakan",
};

/** Lewat dari ini data dianggap terlambat (perangkat sedang offline). */
export const STALE_AFTER_MS = 10 * 60 * 1000;

const SEVERITY: Record<InsightTone, number> = { bad: 0, warn: 1, info: 2, good: 3 };

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** "baru saja" / "5 menit lalu" / "3 jam lalu" / "2 hari lalu". */
export function timeAgo(from: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - from) / 60_000));
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

/** Sapaan berdasarkan jam lokal (0–23). */
export function greetingFor(hour: number): string {
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

function insightTone(tone: CardTone): InsightTone {
  if (tone === "good") return "good";
  if (tone === "moderate") return "warn";
  if (tone === "neutral") return "info";
  return "bad";
}

export type SensorStatusInfo = {
  /** Label status singkat untuk badge kartu. */
  badge: string;
  tone: CardTone;
  /** Kalimat pendek yang mudah dipahami. */
  hint: string;
};

const MISSING_STATUS: SensorStatusInfo = {
  badge: "Belum ada data",
  tone: "neutral",
  hint: "Menunggu data dari perangkat",
};

function toCardTone(tone: "good" | "info" | "warn" | "bad"): CardTone {
  if (tone === "good") return "good";
  if (tone === "warn") return "moderate";
  if (tone === "bad") return "unhealthy";
  return "neutral";
}

/**
 * Status + wording sederhana untuk satu kartu sensor.
 * Dipakai overview, halaman detail, dan chatbot supaya semua konsisten.
 */
export function sensorStatus(
  key: SensorKey,
  value: number | boolean | string | null | undefined,
): SensorStatusInfo {
  if (key === "status") {
    const text = plantStatusText(value as string | number | null | undefined);
    if (text === "Belum ada data") return MISSING_STATUS;
    return {
      badge: text,
      tone: toCardTone(plantStatusTone(value as string | number | null | undefined)),
      hint: plantNote(value as string | number | null | undefined),
    };
  }

  if (key === "pump") {
    if (typeof value !== "boolean") return MISSING_STATUS;
    return {
      badge: value ? "Menyala" : "Mati",
      tone: "neutral",
      hint: value ? "Pompa sedang menyiram" : "Pompa sedang tidak menyiram",
    };
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return MISSING_STATUS;
  }

  switch (key) {
    case "humidity": {
      const band = scaleBand("humidity", value);
      if (!band) return MISSING_STATUS;
      return {
        badge: band.label,
        tone: band.tone,
        hint: "Ideal untuk lumut: 70–90%",
      };
    }
    case "fan_speed": {
      const band = scaleBand("fan_speed", value);
      if (!band) return MISSING_STATUS;
      return {
        badge: band.label,
        tone: band.tone,
        hint: "Idealnya 10–70% dari kecepatan penuh",
      };
    }
    case "brightness": {
      const band = scaleBand("brightness", value);
      if (!band) return MISSING_STATUS;
      return {
        badge: band.label,
        tone: band.tone,
        hint: "Cukup terang, tapi jangan sampai panas",
      };
    }
    case "pm1": {
      const category = pm1Category(value);
      return category
        ? { badge: category.label, tone: category.level, hint: category.short }
        : MISSING_STATUS;
    }
    case "pm25": {
      const category = pm25Category(value);
      return category
        ? { badge: category.label, tone: category.level, hint: category.short }
        : MISSING_STATUS;
    }
    case "pm10": {
      const category = pm10Category(value);
      return category
        ? { badge: category.label, tone: category.level, hint: category.short }
        : MISSING_STATUS;
    }
    case "co2_in":
    case "co2_out": {
      const category = co2Category(value);
      if (!category) return MISSING_STATUS;
      return {
        badge: category.label,
        tone: category.level,
        hint: CO2_GUIDANCE[category.level].short,
      };
    }
    default:
      return MISSING_STATUS;
  }
}

/** Satu kalimat penjelasan di bawah status tanaman. */
export function plantNote(status: string | number | null | undefined): string {
  if (status === null || status === undefined || status === "") {
    return "Belum ada status dari perangkat. Pastikan Mossifier menyala dan terhubung ke Wi-Fi.";
  }
  const text = String(status).toUpperCase();
  if (text === "CRITICAL") {
    return "Lumut terdeteksi kritis. Cari tahu penyebabnya dulu (terlalu kering, panas, atau terlalu basah) sebelum menanam yang baru.";
  }
  if (text === "STRESSED") {
    return "Lumutmu terdeteksi kurang sehat. Cek kelembapan dan cahaya di bawah, lalu pastikan udara tetap mengalir.";
  }
  if (text === "HEALTHY") {
    return "Lumutmu dalam kondisi baik. Pertahankan kelembapan dan cahaya seperti sekarang.";
  }
  return "Status tanaman belum dikenali. Periksa koneksi perangkat.";
}

/**
 * Daftar insight, diurutkan dari yang paling mendesak.
 * `now` = null (sebelum mount di browser) → insight kesegaran data dilewati.
 */
export function buildInsights(
  latest: PublicSensorReading | null | undefined,
  now: number | null,
): Insight[] {
  if (!latest) return [];
  const list: Insight[] = [];

  // 1) Kesegaran data
  const at = new Date(latest.created_at).getTime();
  if (now !== null && Number.isFinite(at)) {
    const ago = timeAgo(at, now);
    list.push(
      now - at > STALE_AFTER_MS
        ? {
            id: "fresh",
            tone: "warn",
            title: "Data sudah lama",
            text: `Data terakhir masuk ${ago}. Perangkat sedang offline — cek daya dan koneksi Wi-Fi ESP32.`,
          }
        : {
            id: "fresh",
            tone: "good",
            title: "Perangkat aktif",
            text: `Data terakhir masuk ${ago}, jadi angka di bawah ini masih segar.`,
          },
    );
  }

  // 2) Status udara (parameter terburuk)
  const air = overallAirQuality(latest);
  if (air) {
    list.push({
      id: "air",
      tone: insightTone(air.level),
      title: "Status udara",
      text: `${air.label}. ${air.advice} Penyebab utama: ${air.driverLabel} ${formatSensorValue(air.driverValue, air.driverKey)}.`,
    });
  }

  // 3) Kelembapan tanah (humidity)
  if (typeof latest.humidity === "number") {
    const band = scaleBand("humidity", latest.humidity);
    if (band) {
      const h = nf.format(latest.humidity);
      const text =
        band.tone === "good"
          ? `Kelembapan tanah ${h}% sudah pas untuk lumut.`
          : latest.humidity < 70
            ? `Kelembapan tanah ${h}% di bawah kisaran ideal lumut (70–90%). Semprot tipis permukaan lumut dan hindari menaruhnya dekat sumber panas.`
            : `Kelembapan tanah ${h}% terlalu tinggi. Pastikan kipas berputar supaya lumut tidak berjamur dan kurangi penyiraman.`;
      list.push({
        id: "humidity",
        tone: insightTone(band.tone),
        title: "Kelembapan tanah",
        text,
      });
    }
  }

  // 4) Fan & LED (persentase aktuator)
  if (typeof latest.fan_speed === "number") {
    const band = scaleBand("fan_speed", latest.fan_speed);
    if (band) {
      list.push({
        id: "fan",
        tone: insightTone(band.tone),
        title: "Kipas",
        text: `Kecepatan kipas ${nf.format(latest.fan_speed)}% — ${band.label.toLowerCase()}.`,
      });
    }
  }
  if (typeof latest.brightness === "number") {
    const band = scaleBand("brightness", latest.brightness);
    if (band) {
      list.push({
        id: "led",
        tone: insightTone(band.tone),
        title: "Lampu LED",
        text: `Kecerahan LED ${nf.format(latest.brightness)}% — ${band.label.toLowerCase()}.`,
      });
    }
  }

  // 5) Pompa
  if (typeof latest.pump === "boolean") {
    list.push({
      id: "pump",
      tone: latest.pump ? "good" : "info",
      title: "Pompa air",
      text: latest.pump
        ? "Pompa sedang menyala — pastikan air tidak menggenangi lumut."
        : "Pompa sedang mati. Nyalakan kalau kelembapan tanah turun di bawah ideal.",
    });
  }

  // 6) Status tanaman (teks)
  if (latest.status !== null && latest.status !== undefined && latest.status !== "") {
    const tone = plantStatusTone(latest.status);
    list.push({
      id: "plant",
      tone,
      title: "Kondisi lumut",
      text: plantNote(latest.status),
    });
  }

  return list
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        SEVERITY[a.item.tone] - SEVERITY[b.item.tone] || a.index - b.index,
    )
    .map(({ item }) => item);
}

export type Tip = { title: string; text: string };

export const MOSS_TIPS: Tip[] = [
  {
    title: "Semprot, jangan disiram",
    text: "Lumut menyerap air lewat daunnya, bukan akar. Semprot tipis sampai permukaannya lembap merata — genangan justru bikin membusuk.",
  },
  {
    title: "Hati-hati dengan air keran",
    text: "Kaporit bisa membuat lumut menguning. Lebih aman pakai air hujan, air kemasan, atau air keran yang sudah diendapkan semalam.",
  },
  {
    title: "Terang, tapi tidak langsung",
    text: "Lumut suka cahaya terang yang lembut. Sinar matahari langsung atau lampu yang terlalu panas membuatnya kering dan coklat.",
  },
  {
    title: "Biarkan udara mengalir",
    text: "Sirkulasi udara mencegah jamur dan bau apek. Kipas dialirkan pelan supaya lumut tetap lembap, tapi jika terlalu kencang lumut kering.",
  },
  {
    title: "Kualitas udara buruk? Tutup jendela",
    text: "Saat kualitas udara naik, tutup jendela sebentar dan hindari aktivitas luar. Lumut membantu sedikit, tapi bukan pengganti filter udara.",
  },
  {
    title: "Lumut bukan pengganti air purifier",
    text: "Lumut membantu menangkap sedikit debu dan menjaga udara tetap lembap, tapi untuk polusi berat tetap perlu ventilasi atau air purifier.",
  },
  {
    title: "Kenali tanda lumut kehausan",
    text: "Lumut yang mulai coklat, kering, dan menciut biasanya kurang lembap. Naikkan kelembapan dan jauhkan dari panas.",
  },
  {
    title: "Bercak hitam berlendir = terlalu basah",
    text: "Kalau muncul bercak hitam, berlendir, atau berbau, artinya terlalu basah dan kurang sirkulasi. Kurangi semprotan dan tambah aliran udara.",
  },
  {
    title: "Jaga tetap sejuk",
    text: "Lumut lebih betah di tempat sejuk dan lembap. Jauhkan dari AC yang menyembur langsung, kompor, atau jendela yang kena matahari siang.",
  },
  {
    title: "Bingung membaca angka?",
    text: "Tanya Kibo, asisten Mossifier di pojok kanan bawah. Dia bisa membaca data perangkatmu dan menjelaskannya dengan bahasa sehari-hari.",
  },
];

/** Tip berganti tiap hari. `dayNumber` = hari sejak epoch (lokal). */
export function tipOfTheDay(dayNumber: number): Tip {
  const index = ((Math.floor(dayNumber) % MOSS_TIPS.length) + MOSS_TIPS.length) % MOSS_TIPS.length;
  return MOSS_TIPS[index];
}
