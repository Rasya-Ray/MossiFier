"use client";

import { AnimatePresence, motion } from "motion/react";
import { itemVariants } from "./motion-variants";

type StatCardProps = {
  label: string;
  value: string;
  hint: string;
};

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <motion.article
      variants={itemVariants}
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="rounded-3xl border border-moss-mist/70 bg-moss-paper p-5 shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-moss-forest/60 uppercase">
          {label}
        </p>
        <motion.span
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
          className="mt-1 h-1 w-8 origin-left rounded-full bg-moss-leaf"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={value}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="mt-3 min-h-10 truncate text-3xl font-semibold tracking-tight text-moss-forest"
        >
          {value}
        </motion.p>
      </AnimatePresence>

      <p className="mt-1 text-xs text-moss-forest/50">{hint}</p>
    </motion.article>
  );
}
