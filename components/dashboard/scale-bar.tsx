"use client";

import { motion } from "motion/react";
import type { SensorScale } from "@/lib/scales";
import { AIR_TONE_STYLE } from "./air-tone";

type ScaleBarProps = {
  scale: SensorScale;
  /** Nilai sekarang. Null = hanya menampilkan zona (tanpa penanda). */
  value?: number | null;
  className?: string;
};

/**
 * Bar zona berwarna + penanda posisi nilai.
 * Lebar tiap zona mengikuti ambang di `lib/scales.ts`.
 */
export function ScaleBar({ scale, value, className }: ScaleBarProps) {
  const span = Math.max(scale.max - scale.min, 1);
  const position =
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(100, Math.max(0, ((value - scale.min) / span) * 100))
      : null;

  return (
    <div className={className}>
      <div
        className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-white/10 shadow-glass-inset"
        role="img"
        aria-label={
          position === null
            ? `Skala ${scale.source}`
            : `Nilai ${value} pada skala ${scale.source}`
        }
      >
        <div className="absolute inset-0 flex">
          {scale.bands.map((band, index) => {
            const start = Math.max(band.from, scale.min);
            const end = Math.min(band.upTo, scale.max);
            const width = Math.max(0, ((end - start) / span) * 100);
            return (
              <span
                key={`${band.label}-${index}`}
                style={{ width: `${width}%` }}
                className={`h-full ${AIR_TONE_STYLE[band.tone].bar}`}
              />
            );
          })}
        </div>

        {position !== null && (
          <motion.span
            initial={{ left: "0%" }}
            animate={{ left: `${position}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-forest-mist shadow-[0_0_10px_rgba(232,245,223,0.75)] ring-1 ring-forest-night/50"
          />
        )}
      </div>

      <div className="mt-1 flex justify-between gap-2 text-[10px] leading-4 text-forest-mist/45">
        <span>
          {scale.min}
          {scale.unit}
        </span>
        <span>{scale.maxLabel ?? `${scale.max}${scale.unit}`}</span>
      </div>
    </div>
  );
}
