import { AIR_TONE_STYLE } from "./air-tone";
import { InfoBoard } from "./info-board";
import { plantNote } from "@/lib/insights";
import { plantStatusText } from "@/lib/labels";
import { sensorScale, type SensorScale } from "@/lib/scales";
import type { SensorKey } from "@/lib/sensors";

type ReferenceContent = {
  title: string;
  intro: string;
  sources: string[];
  notes: string[];
};

/**
 * Papan informasi per tab sensor.
 * Hanya memakai acuan yang benar-benar berlaku:
 * - Kelembapan/kipas/LED = rekomendasi perawatan Mossifier (bukan WHO/BMKG).
 * - Status tanaman = pembacaan perangkat.
 */
const CONTENT: Partial<Record<SensorKey, ReferenceContent>> = {
  humidity: {
    title: "Target kelembapan tanah",
    intro:
      "Angka ini menunjukkan basah atau keringnya tanah tempat lumut tumbuh.",
    sources: ["Rekomendasi Mossifier"],
    notes: [
      "Belum ada baku mutu WHO/BMKG untuk kelembapan tanah. Rentang ini target perawatan lumut Mossifier.",
      "Terlalu kering: semprot tipis permukaan lumut. Terlalu basah: kurangi penyiraman dan tambah aliran udara.",
    ],
  },
  fan_speed: {
    title: "Rekomendasi kecepatan kipas",
    intro: "Kipas menjaga udara mengalir supaya lumut tidak berjamur.",
    sources: ["Rekomendasi Mossifier"],
    notes: [
      "Tidak ada standar WHO/BMKG untuk kecepatan kipas. Rentang ini rekomendasi perangkat.",
      "Terlalu pelan membuat lumut lembap dan berjamur; terlalu kencang membuat lumut cepat kering.",
    ],
  },
  brightness: {
    title: "Rekomendasi cahaya LED",
    intro: "Lampu LED memberi cahaya yang dibutuhkan lumut.",
    sources: ["Rekomendasi Mossifier"],
    notes: [
      "Tidak ada standar WHO/BMKG untuk kecerahan lampu tanam. Rentang ini rekomendasi perangkat.",
      "Terlalu redup membuat lumut pucat; terlalu terang atau panas membuatnya kering dan coklat.",
    ],
  },
};

function BandLegend({ scale }: { scale: SensorScale }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {scale.bands.map((band, index) => (
        <li
          key={`${band.label}-${index}`}
          className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2 shadow-glass-inset"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${AIR_TONE_STYLE[band.tone].bar}`}
            />
            <span className="truncate text-sm text-forest-mist/85">
              {band.label}
            </span>
          </span>
          <span className="shrink-0 text-xs text-forest-mist/55">
            {band.range}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StatusReference() {
  const rows = [
    { code: "HEALTHY", tone: "good" as const },
    { code: "STRESSED", tone: "moderate" as const },
    { code: "CRITICAL", tone: "unhealthy" as const },
  ];

  return (
    <InfoBoard
      title="Arti status tanaman"
      intro="Status ini dikirim langsung oleh perangkat Mossifier."
      sources={["Pembacaan perangkat"]}
      notes={[
        "Perangkat mengirim HEALTHY / STRESSED / CRITICAL; aplikasi menampilkannya sebagai Sehat / Sakit / Mati.",
        "Ini bukan diagnosis otomatis atau baku mutu WHO/BMKG.",
      ]}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {rows.map((row) => (
          <div
            key={row.code}
            className="rounded-2xl bg-white/5 p-3.5 shadow-glass-inset"
          >
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${AIR_TONE_STYLE[row.tone].badge}`}
            >
              {plantStatusText(row.code)}
            </span>
            <p className="mt-2 text-xs leading-5 text-forest-mist/70">
              {plantNote(row.code)}
            </p>
          </div>
        ))}
      </div>
    </InfoBoard>
  );
}

export function SensorReference({ sensorKey }: { sensorKey: SensorKey }) {
  if (sensorKey === "status") return <StatusReference />;

  const content = CONTENT[sensorKey];
  const scale = sensorScale(sensorKey);
  if (!content || !scale) return null;

  return (
    <InfoBoard
      title={content.title}
      intro={content.intro}
      sources={content.sources}
      notes={content.notes}
      className="mt-5"
    >
      <BandLegend scale={scale} />
    </InfoBoard>
  );
}
