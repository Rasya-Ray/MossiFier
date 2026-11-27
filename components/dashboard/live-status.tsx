"use client";

import { AnimatePresence, motion } from "motion/react";
import { LoadingFace } from "@/components/ui";
import { useNow } from "@/components/dashboard/use-now";

const STALE_AFTER_MS = 10 * 60 * 1000;

type LiveStatusProps = {
  isFetching?: boolean;
  lastUpdated?: number | null;
  readingAt?: string | null;
  error?: string | null;
};

/** Indikator kesegaran data (ditarik ulang otomatis tiap 10 detik). */
export function LiveStatus({
  isFetching = false,
  lastUpdated,
  readingAt,
  error,
}: LiveStatusProps) {
  const now = useNow();
  const readingTime = readingAt ? Date.parse(readingAt) : 0;
  const isStale =
    now !== null &&
    readingTime > 0 &&
    now - readingTime > STALE_AFTER_MS;
  const checkedAt = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div
        title={
          error
            ? "Gagal memperbarui data; nilai terakhir tetap ditampilkan"
            : isStale
              ? "Data terakhir perangkat lebih dari 10 menit lalu"
              : "Data diperbarui otomatis setiap 10 detik"
        }
        className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl px-3 py-2 text-[11px] text-forest-mist/70 shadow-glass-sm"
      >
        <motion.span
          aria-label={error || isStale ? "data terakhir" : "live"}
          className={`h-2 w-2 rounded-full ${error || isStale ? "bg-forest-fern" : "bg-forest-lime"}`}
          animate={
            error || isStale
              ? { opacity: 1 }
              : { scale: [1, 1.7, 1], opacity: [1, 0.45, 1] }
          }
          transition={
            error || isStale
              ? { duration: 0 }
              : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <span className="font-semibold tracking-wide text-forest-mist">
          {error ? "OFFLINE" : isStale ? "DATA TERAKHIR" : "LIVE"}
        </span>
        <span className="text-forest-mist/50">
          · {isStale ? "perangkat sedang offline" : "otomatis"}
        </span>
        <span className="text-forest-mist/50">· cek {checkedAt}</span>

        <AnimatePresence>
          {isFetching && (
            <motion.span
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="ml-0.5"
            >
              <LoadingFace label={null} tone="dark" size="sm" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
