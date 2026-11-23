/**
 * Penjelasan "manusiawi" dari data sensor untuk dashboard.
 * Fungsi murni (tanpa Date.now / akses browser): waktu selalu dikirim dari luar.
 * Ambang batas sengaja sama dengan pengetahuan chatbot (lib/chat/knowledge.ts)
 * supaya dashboard dan Kibo tidak saling bertentangan.
 */

import type { PublicSensorReading, SensorKey } from "@/lib/sensors";
import { plantStatusText } from "@/lib/labels";

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

/** Lewat dari ini data dianggap terlambat (perangkat mungkin offline). */
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

type Level = { tone: InsightTone; label: string };

function soilLevel(pct: number): Level {
  if (pct < 50) return { tone: "bad", label: "Terlalu kering untuk lumut" };
  if (pct < 70) return { tone: "warn", label: "Agak kering (ideal 70–90%)" };
  if (pct <= 90) return { tone: "good", label: "Ideal untuk lumut" };
  return { tone: "warn", label: "Terlalu basah" };
}

function pm25Level(value: number): Level {
  if (value <= 12) return { tone: "good", label: "Udara bersih" };
  if (value <= 35) return { tone: "warn", label: "Masih wajar" };
  if (value <= 55) return { tone: "bad", label: "Tinggi" };
  return { tone: "bad", label: "Sangat tinggi" };
}

function fanLevel(pct: number): Level {
  if (pct < 10) return { tone: "warn", label: "Hampir mati" };
  if (pct <= 70) return { tone: "good", label: "Aliran udara pas" };
  return { tone: "warn", label: "Terlalu kencang" };
}

function ledLevel(pct: number): Level {
  if (pct < 10) return { tone: "warn", label: "Sangat redup" };
  if (pct <= 80) return { tone: "good", label: "Cahaya cukup" };
  return { tone: "warn", label: "Terlalu terang/panas" };
}

/** Keterangan pendek di bawah angka pada kartu sensor. */
export function sensorHint(
  key: SensorKey,
  value: number | boolean | null | undefined,
): string {
  if (key === "plant_status") {
    const text = plantStatusText(typeof value === "boolean" ? Number(value) : value);
    return text === "Belum ada data" ? "Menunggu klasifikasi AI" : text;
  }
  if (key === "pump") {
    if (typeof value !== "boolean") return "Menunggu data";
    return value ? "Pompa menyala" : "Pompa mati";
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return "Menunggu data";

  switch (key) {
    case "soil_moisture":
      return soilLevel(value).label;
    case "pm25":
      return pm25Level(value).label;
    case "pm1":
      return value <= 15 ? "Partikel ultra halus rendah" : "Partikel ultra halus tinggi";
    case "pm10":
      return value <= 45 ? "Debu kasar rendah" : "Debu kasar tinggi";
    case "mq135_1":
    case "mq135_2":
      return "Dibaca dari sensor gas";
    case "fan":
      return fanLevel(value).label;
    case "led":
      return ledLevel(value).label;
  }
}

/** Satu kalimat penjelasan di bawah status tanaman. */
export function plantNote(status: number | null | undefined): string {
  if (status === null || status === undefined) {
    return "Belum ada status dari perangkat. Pastikan Mossifier menyala dan terhubung ke Wi-Fi.";
  }
  if (status === 2) {
    return "Lumut terdeteksi mati. Cari tahu penyebabnya dulu (terlalu kering, panas, atau terlalu basah) sebelum menanam yang baru.";
  }
  if (status === 1) {
    return "Lumutmu terdeteksi kurang sehat. Cek kelembapan dan cahaya di bawah, lalu pastikan udara tetap mengalir.";
  }
  if (status === 0) {
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
            text: `Data terakhir masuk ${ago}. Perangkat mungkin offline — cek daya dan koneksi Wi-Fi ESP32.`,
          }
        : {
            id: "fresh",
            tone: "good",
            title: "Perangkat aktif",
            text: `Data terakhir masuk ${ago}, jadi angka di bawah ini masih segar.`,
          },
    );
  }

  // 2) Kelembapan tanah
  if (typeof latest.soil_moisture === "number") {
    const level = soilLevel(latest.soil_moisture);
    const h = nf.format(latest.soil_moisture);
    const text =
      level.tone === "good"
        ? `Kelembapan tanah ${h}% sudah pas untuk lumut.`
        : latest.soil_moisture < 70
          ? `Kelembapan tanah ${h}% di bawah kisaran ideal lumut (70–90%). Semprot tipis permukaan lumut dan hindari menaruhnya dekat sumber panas.`
          : `Kelembapan tanah ${h}% terlalu tinggi. Pastikan kipas berputar supaya lumut tidak berjamur dan kurangi penyiraman.`;
    list.push({ id: "soil", tone: level.tone, title: "Kelembapan tanah", text });
  }

  // 3) PM2.5
  if (typeof latest.pm25 === "number") {
    const level = pm25Level(latest.pm25);
    const text =
      level.tone === "good"
        ? `PM2.5 ${nf.format(latest.pm25)} — partikel halus rendah, udara terasa bersih.`
        : `PM2.5 ${nf.format(latest.pm25)} — partikel halus sedang/tinggi. Kurangi aktivitas luar atau tutup jendela sebentar.`;
    list.push({ id: "pm25", tone: level.tone, title: "Partikulat PM2.5", text });
  }

  // 4) Fan & LED (persentase aktuator)
  if (typeof latest.fan === "number") {
    const level = fanLevel(latest.fan);
    list.push({
      id: "fan",
      tone: level.tone,
      title: "Kipas",
      text: `Kecepatan kipas ${nf.format(latest.fan)}% — ${level.label.toLowerCase()}.`,
    });
  }
  if (typeof latest.led === "number") {
    const level = ledLevel(latest.led);
    list.push({
      id: "led",
      tone: level.tone,
      title: "Lampu LED",
      text: `Kecerahan LED ${nf.format(latest.led)}% — ${level.label.toLowerCase()}.`,
    });
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

  // 6) Status tanaman
  if (latest.plant_status !== null && latest.plant_status !== undefined) {
    const tone: InsightTone =
      latest.plant_status === 2
        ? "bad"
        : latest.plant_status === 1
          ? "warn"
          : latest.plant_status === 0
            ? "good"
            : "info";
    list.push({
      id: "plant",
      tone,
      title: "Kondisi lumut",
      text: plantNote(latest.plant_status),
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
    text: "Sirkulasi udara mencegah jamur dan bau apek. Tapi kipas yang terlalu kencang mengeringkan lumut, jadi cukup mengalir pelan.",
  },
  {
    title: "PM2.5 tinggi? Tutup jendela",
    text: "Saat partikel halus naik, tutup jendela sebentar dan hindari aktivitas luar. Lumut membantu sedikit, tapi bukan pengganti filter udara.",
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