/**
 * Penjelasan "manusiawi" dari data sensor untuk dashboard.
 * Fungsi murni (tanpa Date.now / akses browser): waktu selalu dikirim dari luar.
 * Ambang batas sengaja sama dengan pengetahuan chatbot (lib/chat/knowledge.ts)
 * supaya dashboard dan Kibo tidak saling bertentangan.
 */

import type { SensorKey, SensorReading } from "@/lib/sensors";

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

function co2InLevel(ppm: number): Level {
  if (ppm < 800) return { tone: "good", label: "Sangat baik" };
  if (ppm < 1000) return { tone: "good", label: "Masih wajar" };
  if (ppm < 1500) return { tone: "warn", label: "Mulai pengap" };
  if (ppm < 2000) return { tone: "bad", label: "Pengap" };
  return { tone: "bad", label: "Sangat pengap" };
}

function humidityLevel(pct: number): Level {
  if (pct < 50) return { tone: "bad", label: "Terlalu kering untuk lumut" };
  if (pct < 70) return { tone: "warn", label: "Agak kering (ideal 70–90%)" };
  if (pct <= 90) return { tone: "good", label: "Ideal untuk lumut" };
  return { tone: "warn", label: "Sangat lembap" };
}

/** Keterangan pendek di bawah angka pada kartu sensor. */
export function sensorHint(
  key: SensorKey,
  value: number | null | undefined,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Menunggu data";
  switch (key) {
    case "co2_in":
      return co2InLevel(value).label;
    case "co2_out":
      if (value <= 500) return "Normal untuk udara luar";
      if (value <= 700) return "Sedikit di atas normal";
      return "Tinggi untuk udara luar";
    case "humidity":
      return humidityLevel(value).label;
    case "air_quality":
      return "Dibaca dari sensor udara";
    case "brightness":
      return "Cahaya untuk lumut";
    case "fan_speed":
      return "Aliran udara ke lumut";
  }
}

/** Satu kalimat penjelasan di bawah status tanaman. */
export function plantNote(status: string | null | undefined): string {
  const text = (status ?? "").trim().toLowerCase();
  if (!text) {
    return "Belum ada status dari perangkat. Pastikan Mossifier menyala dan terhubung ke Wi-Fi.";
  }
  if (text.includes("mati")) {
    return "Lumut terdeteksi mati. Cari tahu penyebabnya dulu (terlalu kering, panas, atau terlalu basah) sebelum menanam yang baru.";
  }
  if (text.includes("sakit")) {
    return "Lumutmu terdeteksi kurang sehat. Cek kelembapan dan cahaya di bawah, lalu pastikan udara tetap mengalir.";
  }
  if (text.includes("sehat")) {
    return "Lumutmu dalam kondisi baik. Pertahankan kelembapan dan cahaya seperti sekarang.";
  }
  return `Perangkat melaporkan status “${(status ?? "").trim().slice(0, 40)}”.`;
}

/**
 * Daftar insight, diurutkan dari yang paling mendesak.
 * `now` = null (sebelum mount di browser) → insight kesegaran data dilewati.
 */
export function buildInsights(
  latest: SensorReading | null | undefined,
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

  // 2) Kelembapan
  if (typeof latest.humidity === "number") {
    const level = humidityLevel(latest.humidity);
    const h = nf.format(latest.humidity);
    const text =
      level.tone === "good"
        ? `Kelembapan ${h}% sudah pas untuk lumut.`
        : latest.humidity < 70
          ? `Kelembapan ${h}% di bawah kisaran ideal lumut (70–90%). Semprot tipis permukaan lumut dan hindari menaruhnya dekat sumber panas.`
          : `Kelembapan ${h}% sangat tinggi. Pastikan kipas berputar supaya lumut tidak berjamur.`;
    list.push({ id: "humidity", tone: level.tone, title: "Kelembapan", text });
  }

  // 3) CO₂ dalam ruangan (+ pembanding luar ruangan)
  if (typeof latest.co2_in === "number") {
    const level = co2InLevel(latest.co2_in);
    const ppm = nf.format(latest.co2_in);
    let text =
      level.tone === "good"
        ? `CO₂ dalam ruangan ${ppm} ppm — udara terasa segar.`
        : `CO₂ dalam ruangan ${ppm} ppm. Buka jendela atau pintu sebentar agar udara segar masuk.`;
    if (
      typeof latest.co2_out === "number" &&
      latest.co2_in - latest.co2_out > 600
    ) {
      text += ` Selisihnya dengan luar ruangan cukup besar (${nf.format(latest.co2_in - latest.co2_out)} ppm), tanda sirkulasi udara kurang.`;
    }
    list.push({ id: "co2", tone: level.tone, title: "CO₂ dalam ruangan", text });
  }

  // 4) Status tanaman
  const status = (latest.status ?? "").trim().toLowerCase();
  if (status) {
    const tone: InsightTone = status.includes("mati")
      ? "bad"
      : status.includes("sakit")
        ? "warn"
        : status.includes("sehat")
          ? "good"
          : "info";
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
    text: "Sirkulasi udara mencegah jamur dan bau apek. Tapi kipas yang terlalu kencang mengeringkan lumut, jadi cukup mengalir pelan.",
  },
  {
    title: "CO₂ naik? Buka ventilasi",
    text: "Di atas 1.000 ppm ruangan mulai pengap dan mudah bikin ngantuk. Membuka jendela sebentar biasanya langsung menurunkannya.",
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
