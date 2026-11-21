"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 15_000;

function subscribe(onChange: () => void): () => void {
  const id = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(id);
}

/** Dibulatkan ke menit agar nilainya stabil (syarat useSyncExternalStore). */
function getSnapshot(): number {
  return Math.floor(Date.now() / 60_000) * 60_000;
}

/**
 * Waktu sekarang (ms) yang aman dari hydration mismatch:
 * `null` di server & render pertama, lalu terisi dan diperbarui tiap menit.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
