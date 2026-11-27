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
 *
 * Animasi memakai `transform` (dikerjakan GPU) lewat Web Animations API,
 * bukan menulis `background-position` tiap frame. Hasil visual sama, tetapi
 * tidak ada repaint layar penuh dan tidak ada JavaScript per frame.
 */
export function ForestBackground() {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;

    // Hormati preferensi pengguna yang mematikan animasi.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let animation: Animation | null = null;
    let tileWidth = 0;
    let resizeTimer = 0;

    /** Mulai ulang animasi, opsional melanjutkan dari fase tertentu (0–1). */
    const start = (fromPhase = 0) => {
      animation?.cancel();

      // Tinggi elemen = tinggi viewport (fixed inset-0), jadi lebar satu ubin
      // yang menutup penuh secara vertikal adalah tinggi × rasio gambar.
      const next = el.getBoundingClientRect().height * TILE_ASPECT;
      if (!(next > 0)) return;

      tileWidth = next;
      // Lebih lebar satu ubin dari layar supaya saat digeser tidak ada celah.
      el.style.width = `calc(100% + ${tileWidth}px)`;

      const duration = (tileWidth / SPEED_PX_PER_SECOND) * 1000;
      animation = el.animate(
        [
          { transform: "translate3d(0, 0, 0)" },
          { transform: `translate3d(${-tileWidth}px, 0, 0)` },
        ],
        { duration, iterations: Infinity, easing: "linear" },
      );

      if (fromPhase > 0) animation.currentTime = fromPhase * duration;
    };

    start();

    // Ukuran ubin bergantung tinggi layar. Hitung ulang hanya kalau berubah,
    // dan lanjutkan dari fase yang sama agar tidak melompat.
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const height = el.getBoundingClientRect().height;
        if (Math.abs(height * TILE_ASPECT - tileWidth) <= 1) return;
        const progress = animation?.effect?.getComputedTiming().progress;
        start(typeof progress === "number" ? progress : 0);
      }, 200);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(resizeTimer);
      animation?.cancel();
      el.style.width = "";
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-forest-night"
    >
      <div
        ref={stripRef}
        className="absolute inset-y-0 left-0 w-full will-change-transform"
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
