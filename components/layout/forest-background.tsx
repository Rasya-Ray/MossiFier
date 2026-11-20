"use client";

import { useEffect, useRef } from "react";

/** Kecepatan geser latar (piksel per detik). */
const SPEED_PX_PER_SECOND = 5;

/** Rasio aspek public/forest.svg (1920 × 1080) untuk menghitung lebar satu ubin. */
const TILE_ASPECT = 1920 / 1080;

/**
 * Latar hutan tetap (fixed) di belakang semua halaman.
 * Gambar: public/forest.svg (hutan pinus berkabut), digeser tanpa henti ke
 * samping dengan kecepatan konstan 5 px/detik (parallax horizontal).
 * Gambar diulang ke samping, jadi tidak pernah terlihat ujungnya.
 */
export function ForestBackground() {
  const tileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tileRef.current;
    if (!el) return;

    // Hormati preferensi pengguna yang mematikan animasi.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let last = performance.now();
    let offset = 0;

    const step = (now: number) => {
      // Batasi delta supaya tidak melompat saat tab kembali aktif.
      const delta = Math.min(now - last, 100) / 1000;
      last = now;

      const tileWidth = el.clientHeight * TILE_ASPECT;
      if (tileWidth > 0) {
        offset = (offset + SPEED_PX_PER_SECOND * delta) % tileWidth;
        el.style.backgroundPositionX = `${-offset}px`;
      }

      frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-forest-night"
    >
      <div
        ref={tileRef}
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/forest.svg)",
          backgroundRepeat: "repeat-x",
          backgroundSize: "auto 100%",
          backgroundPosition: "0 center",
        }}
      />
      <div className="absolute inset-0 bg-linear-to-b from-forest-night/50 via-forest-night/20 to-forest-night/70" />
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-forest-lime/20 blur-3xl" />
      <div className="absolute right-0 bottom-0 h-112 w-md rounded-full bg-forest-fern/25 blur-3xl" />
    </div>
  );
}
