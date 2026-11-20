"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useSession } from "@/components/auth/session-provider";
import { formatDateTime } from "@/lib/format";
import { formatPlantStatus } from "@/lib/labels";
import {
  SENSOR_KEYS,
  SENSOR_LABELS,
  formatSensorValue,
} from "@/lib/sensors";
import { ArrowRightIcon, ClockIcon, SproutIcon } from "@/components/dashboard/icons";
import { containerVariants, itemVariants } from "@/components/dashboard/motion-variants";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { LiveStatus } from "@/components/dashboard/live-status";
import { StatCard } from "@/components/dashboard/stat-card";
import { useRealtimeSensors } from "@/components/dashboard/use-realtime";
import { useDevice } from "@/components/device/device-provider";
import { NoDevice } from "@/components/device/no-device";

export function Overview() {
  const session = useSession();
  const userName = session?.name ?? session?.email.split("@")[0] ?? "";
  const { deviceId } = useDevice();
  const live = useRealtimeSensors();

  if (!deviceId) return <NoDevice />;
  if (live.isFetching && !live.latest) return <DashboardSkeleton />;

  const latest = live.latest;
  const plantValue = latest?.status
    ? formatPlantStatus(latest.status)
    : "Belum ada data";

  return (
    <motion.main
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:px-8 sm:pt-10 sm:pb-12"
    >
      <motion.header
        variants={itemVariants}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <p className="text-xs font-medium tracking-wide text-forest-mist/70 uppercase">
            Ringkasan terbaru
          </p>
          <h1 className="mt-1 text-xl font-semibold text-forest-mist sm:text-2xl">
            Halo, {userName || "Explorer"} 👋
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="hidden items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl px-4 py-2 text-xs text-forest-mist/70 shadow-glass-sm sm:flex">
            <ClockIcon className="h-3.5 w-3.5 text-forest-lime" />
            Data sensor: {formatDateTime(latest?.created_at)}
          </span>
          <LiveStatus
            isFetching={live.isFetching}
            lastUpdated={live.lastUpdated}
            error={live.error}
          />
        </div>
      </motion.header>

      <motion.section
        variants={itemVariants}
        className="mt-8 overflow-hidden rounded-[2rem] border border-white/20 bg-linear-to-br from-white/20 via-white/10 to-white/5 p-6 shadow-glass sm:p-9"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-[0.2em] text-forest-mist/70 uppercase">
              Status tanaman
            </p>
            <motion.p
              key={plantValue}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 text-3xl font-semibold tracking-tight break-words text-forest-mist sm:text-5xl"
            >
              {plantValue}
            </motion.p>
          </div>
          <div className="flex flex-row items-center gap-3 rounded-3xl bg-white/10 p-4 shadow-glass-sm backdrop-blur-xl sm:flex-col sm:p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-forest-mist sm:h-14 sm:w-14">
              <SproutIcon className="h-6 w-6" />
            </span>
            <Link
              href="/dashboard/status-tanaman"
              className="flex items-center gap-1.5 text-xs font-semibold text-forest-mist underline decoration-forest-lime decoration-2 underline-offset-2"
            >
              Lihat detail <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="mt-8">
        <p className="text-xs font-medium tracking-wide text-forest-mist/70 uppercase">
          Pembacaan terbaru
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SENSOR_KEYS.map((key) => (
            <StatCard
              key={key}
              label={SENSOR_LABELS[key]}
              value={formatSensorValue(latest?.[key], key)}
              hint={latest ? "Realtime dari perangkat" : "Menunggu data"}
            />
          ))}
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="mt-8">
        <p className="text-xs font-medium tracking-wide text-forest-mist/70 uppercase">
          Jelajahi sensor
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            href="/dashboard/air-quality"
            className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl px-4 py-2.5 text-xs font-medium text-forest-mist shadow-glass-sm"
          >
            <span>Air Quality</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-forest-lime" />
          </Link>
          <Link
            href="/dashboard/kelembapan"
            className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl px-4 py-2.5 text-xs font-medium text-forest-mist shadow-glass-sm"
          >
            <span>Kelembapan</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-forest-lime" />
          </Link>
          <Link
            href="/dashboard/kecepatan-fan"
            className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl px-4 py-2.5 text-xs font-medium text-forest-mist shadow-glass-sm"
          >
            <span>Kecepatan Fan</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-forest-lime" />
          </Link>
          <Link
            href="/dashboard/kecerahan"
            className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl px-4 py-2.5 text-xs font-medium text-forest-mist shadow-glass-sm"
          >
            <span>Kecerahan LED</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-forest-lime" />
          </Link>
          <Link
            href="/dashboard/status-tanaman"
            className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl px-4 py-2.5 text-xs font-medium text-forest-mist shadow-glass-sm"
          >
            <span>Status Tanaman</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-forest-lime" />
          </Link>
        </div>
      </motion.section>

      <motion.footer
        variants={itemVariants}
        className="mt-10 border-t border-white/20 pt-6 text-center text-xs leading-5 text-forest-mist/60"
      >
        Device {latest?.device_id ?? "—"} · Realtime via Supabase
      </motion.footer>
    </motion.main>
  );
}
