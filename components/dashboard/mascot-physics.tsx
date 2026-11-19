"use client";

import { useRef } from "react";
import { motion, useReducedMotion } from "motion/react";

type MascotPhysicsProps = {
  size?: number;
};

/**
 * Maskot bola wajah "Mossy" yang menempel di pojok kanan bawah dashboard.
 * Bisa di-drag ke seluruh area layar (dibatasi viewport), lalu dilepas di tempat.
 * Semua warna memakai palet moss (tidak ada hex/hardcode putih-hitam).
 */
export function MascotPhysics({ size = 96 }: MascotPhysicsProps) {
  const reduceMotion = useReducedMotion();
  const constraintsRef = useRef<HTMLDivElement>(null);

  const eye = Math.max(6, Math.round(size * 0.09));
  const gap = Math.round(size * 0.2);
  const mouthWidth = Math.round(size * 0.22);
  const mouthHeight = Math.round(size * 0.12);

  return (
    <>
      <div
        ref={constraintsRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-3 z-30"
      />

      <motion.div
        aria-hidden="true"
        drag
        dragConstraints={constraintsRef}
        dragMomentum={false}
        dragElastic={0.08}
        initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileDrag={{ scale: 1.08, cursor: "grabbing" }}
        style={{ width: size, height: size }}
        className="fixed right-4 bottom-4 z-40 grid cursor-grab touch-none place-items-center rounded-full bg-forest-lime shadow-glass select-none sm:right-6 sm:bottom-6"
      >
        <div className="flex items-center" style={{ gap }}>
          <span
            className="rounded-full bg-forest-night"
            style={{ width: eye, height: eye }}
          />
          <span
            className="rounded-full bg-forest-night"
            style={{ width: eye, height: eye }}
          />
        </div>
        <span
          className="absolute left-1/2 -translate-x-1/2 rounded-b-full bg-forest-night"
          style={{
            width: mouthWidth,
            height: mouthHeight,
            bottom: Math.round(size * 0.24),
          }}
        />
      </motion.div>
    </>
  );
}
