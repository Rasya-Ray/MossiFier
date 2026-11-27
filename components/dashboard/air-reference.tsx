import { AIR_TONE_STYLE } from "./air-tone";
import { InfoBoard } from "./info-board";
import {
  AIR_GUIDE,
  AIR_SOURCE_NOTE,
  PM1_NOTE,
  WHO_GUIDE,
  WHO_NOTE,
} from "@/lib/air-quality";

/**
 * Papan informasi kualitas udara.
 * Sumber dipisah tegas: kategori warna = BMKG/ISPU, pembanding kesehatan = WHO,
 * CO₂ = acuan ruangan ASHRAE/EPA (bukan ISPU).
 */
export function AirReference() {
  return (
    <InfoBoard
      title="Panduan kualitas udara"
      intro="Bandingkan angka sensor dengan kategori di bawah. Makin ke kanan, makin perlu perhatian."
      sources={["BMKG", "ISPU", "WHO 2021", "ASHRAE/EPA"]}
      notes={[
        PM1_NOTE,
        "Nilai CO₂ berasal dari sensor gas MQ-135, jadi bisa berbeda dengan alat ukur CO₂ yang terkalibrasi.",
        AIR_SOURCE_NOTE,
      ]}
      className="mt-5"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {WHO_GUIDE.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl bg-white/5 p-3.5 shadow-glass-inset"
          >
            <p className="text-[11px] font-medium tracking-wide text-forest-mist/55 uppercase">
              WHO 2021 · {item.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-forest-mist">
              {item.limit}
            </p>
            <p className="mt-0.5 text-[11px] text-forest-mist/50">
              {item.period}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-5 text-forest-mist/45">
        {WHO_NOTE}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="text-[11px] font-medium tracking-wide text-forest-mist/60 uppercase">
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 pr-4 font-medium">PM2.5 (µg/m³)</th>
              <th className="pb-2 pr-4 font-medium">PM10 (µg/m³)</th>
              <th className="pb-2 font-medium">CO₂ (ppm)</th>
            </tr>
          </thead>
          <tbody>
            {AIR_GUIDE.map((row) => {
              const style = AIR_TONE_STYLE[row.level];
              return (
                <tr key={row.level} className="border-t border-white/10">
                  <td className="py-2.5 pr-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.badge}`}
                    >
                      {row.label}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-forest-mist/80">{row.pm25}</td>
                  <td className="py-2.5 pr-4 text-forest-mist/80">{row.pm10}</td>
                  <td className="py-2.5 text-forest-mist/80">{row.co2}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-5 text-forest-mist/50">
        Angka pada tabel adalah konsentrasi (µg/m³ atau ppm), bukan nilai ISPU.
        Kategori diambil dari ambang konsentrasi yang dipakai BMKG/ISPU.
      </p>
    </InfoBoard>
  );
}
