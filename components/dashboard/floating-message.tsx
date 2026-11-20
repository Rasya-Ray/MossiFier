"use client";

import { motion } from "motion/react";

type FloatingMessageProps = {
  size?: number;
};

/**
 * Penanda melayang di pojok kanan bawah dashboard.
 * Menggantikan maskot lama: sebuah lingkaran hijau (vektor SVG)
 * berisi ikon pesan. Diposisikan absolute di dalam overlay fixed.
 */
export function FloatingMessage({ size = 56 }: FloatingMessageProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 20 }}
        style={{ width: size, height: size }}
        className="absolute right-4 bottom-4 rounded-full shadow-glass sm:right-6 sm:bottom-6"
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 56 56"
          role="presentation"
          className="block h-full w-full"
        >
          <circle cx="28" cy="28" r="26" fill="var(--forest-lime)" />
          <g
            fill="none"
            stroke="var(--forest-night)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 18h22a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H26l-6 5v-5h-3a3 3 0 0 1-3-3V21a3 3 0 0 1 3-3Z" />
            <path d="M21 25h14M21 30h9" />
          </g>
        </svg>
      </motion.div>
    </div>
  );
}
