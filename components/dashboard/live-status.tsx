"use client";

import { AnimatePresence, motion } from "motion/react";
import { LoadingFace } from "@/components/ui";

type LiveStatusProps = {
  isFetching?: boolean;
  lastUpdated?: number | null;
  error?: string | null;
};

/** Indikator data realtime dari Supabase (push, bukan polling). */
export function LiveStatus({
  isFetching = false,
  lastUpdated,
  error,
}: LiveStatusProps) {
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
        title="Supabase Realtime — data baru langsung masuk tanpa polling"
        className="flex items-center gap-2 rounded-full border border-moss-mist/70 bg-moss-paper px-3 py-2 text-[11px] text-moss-forest/60 shadow-soft-sm"
      >
        <motion.span
          aria-label={error ? "offline" : "live"}
          className="h-2 w-2 rounded-full bg-moss-leaf"
          animate={
            error
              ? { opacity: 1 }
              : { scale: [1, 1.7, 1], opacity: [1, 0.45, 1] }
          }
          transition={
            error
              ? { duration: 0 }
              : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
          }
        />
        <span className="font-semibold tracking-wide text-moss-forest">
          {error ? "OFFLINE" : "LIVE"}
        </span>
        <span className="text-moss-forest/40">· realtime</span>
        <span className="text-moss-forest/40">· cek {checkedAt}</span>

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
