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
 * Menghormati reduced-motion (tidak berputar bila pengguna meminta animasi dikurangi).
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
      className={`grid shrink-0 place-items-center rounded-full font-semibold tracking-tight shadow-glass ${
        small ? "h-6 w-6 text-[8px]" : "h-14 w-14 text-sm"
      } ${
        dark ? "bg-forest-lime text-forest-night" : "bg-white/15 text-forest-mist backdrop-blur-xl"
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
            dark ? "text-forest-mist/70" : "text-forest-mist/70"
          }`}
        >
          {label}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[80] grid place-items-center bg-forest-night/80 backdrop-blur-xl">
        {content}
      </div>
    );
  }

  return content;
}
