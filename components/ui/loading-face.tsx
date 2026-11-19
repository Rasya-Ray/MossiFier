"use client";

import { motion, useReducedMotion } from "motion/react";

type LoadingFaceProps = {
  /** Teks di bawah wajah. `null` = tanpa teks. Default: "Memuat data...". */
  label?: string | null;
  /** "dark" = bola forest + wajah paper. "light" = kebalikannya (untuk bg gelap). */
  tone?: "dark" | "light";
  /** true = fixed overlay menutupi seluruh layar. */
  fullScreen?: boolean;
  /** "sm" = indikator inline (mis. di badge live), "md" = ukuran normal. */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Loading lucu ala Gen Z: bola wajah "O_O" yang muter-muter.
 * Hormat reduced-motion (nggak muter kalau user minta kurangi animasi).
 */
export function LoadingFace({
  label = "Memuat data...",
  tone = "dark",
  fullScreen = false,
  size = "md",
  className = "",
}: LoadingFaceProps) {
  const reduceMotion = useReducedMotion();
  const dark = tone === "dark";
  const small = size === "sm";

  const face = (
    <motion.div
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold tracking-tight shadow-soft ${
        small ? "h-6 w-6 text-[8px]" : "h-14 w-14 text-sm"
      } ${
        dark ? "bg-moss-forest text-moss-paper" : "bg-moss-paper text-moss-forest"
      }`}
      animate={reduceMotion ? undefined : { rotate: 360 }}
      transition={
        reduceMotion
          ? undefined
          : { duration: 1.4, ease: "linear", repeat: Infinity }
      }
    >
      O_O
    </motion.div>
  );

  const content = (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {face}
      {label !== null && (
        <p
          className={`text-xs font-medium ${
            dark ? "text-moss-forest/60" : "text-moss-paper/70"
          }`}
        >
          {label}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-moss-paper">
        {content}
      </div>
    );
  }

  return content;
}
