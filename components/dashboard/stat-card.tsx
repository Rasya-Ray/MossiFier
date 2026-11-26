"use client";

import { AnimatePresence, motion } from "motion/react";
import type { CardTone } from "@/lib/air-quality";
import { AIR_TONE_STYLE } from "./air-tone";
import { itemVariants } from "./motion-variants";

type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  /** Warna indikator status (default netral). */
  tone?: CardTone;
  /** Label status singkat, mis. "Baik", "Ideal", "Sehat". */
  badge?: string;
  /** Keterangan tambahan, mis. rentang kategori. */
  advice?: string;
};

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  badge,
  advice,
}: StatCardProps) {
  const style = AIR_TONE_STYLE[tone];

  return (
    <motion.article
      variants={itemVariants}
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className={`rounded-3xl border p-4 shadow-glass backdrop-blur-xl sm:p-5 ${style.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-forest-mist/70 uppercase">
          {label}
        </p>
        {badge ? (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.badge}`}
          >
            {badge}
          </span>
        ) : (
          <motion.span
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
            className={`mt-1 h-1 w-8 origin-left rounded-full ${style.bar}`}
          />
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={value}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="mt-3 min-h-10 truncate text-2xl font-semibold tracking-tight text-forest-mist sm:text-3xl"
        >
          {value}
        </motion.p>
      </AnimatePresence>

      <p className="mt-1 text-xs leading-5 text-forest-mist/60">{hint}</p>
      {advice && (
        <p className="mt-1 text-[11px] leading-4 text-forest-mist/50">{advice}</p>
      )}
    </motion.article>
  );
}
