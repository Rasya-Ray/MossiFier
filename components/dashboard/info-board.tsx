"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { InfoIcon } from "./icons";
import { itemVariants } from "./motion-variants";

type InfoBoardProps = {
  title: string;
  intro?: string;
  /** Sumber/acuan yang benar-benar dipakai (ditampilkan sebagai chip). */
  sources?: string[];
  /** Catatan kecil di bawah, mis. keterbatasan sensor. */
  notes?: string[];
  children?: ReactNode;
  className?: string;
};

/**
 * Papan informasi yang dipakai di setiap tab.
 * Semua isi harus punya sumber jelas — jangan menaruh angka tanpa acuan.
 */
export function InfoBoard({
  title,
  intro,
  sources = [],
  notes = [],
  children,
  className,
}: InfoBoardProps) {
  return (
    <motion.section
      variants={itemVariants}
      className={`rounded-3xl border border-white/20 bg-white/10 p-5 shadow-glass backdrop-blur-xl sm:p-6 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-forest-lime shadow-glass-sm">
            <InfoIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-wide text-forest-mist/55 uppercase">
              Papan informasi
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-forest-mist sm:text-lg">
              {title}
            </h2>
            {intro && (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-forest-mist/70">
                {intro}
              </p>
            )}
          </div>
        </div>

        {sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sources.map((source) => (
              <span
                key={source}
                className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-forest-mist/70"
              >
                {source}
              </span>
            ))}
          </div>
        )}
      </div>

      {children && <div className="mt-5">{children}</div>}

      {notes.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-3 text-[11px] leading-5 text-forest-mist/50">
          {notes.map((note) => (
            <li key={note} className="flex gap-1.5">
              <span aria-hidden="true" className="text-forest-lime/70">
                •
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
