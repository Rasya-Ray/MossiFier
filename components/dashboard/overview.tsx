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
      className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10"
    >
      <motion.header
        variants={itemVariants}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <p className="text-xs font-medium tracking-wide text-moss-forest/60 uppercase">
            Ringkasan terbaru
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-moss-forest">
            Halo, {userName || "Explorer"} 👋
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="hidden items-center gap-2 rounded-full border border-moss-mist/70 bg-moss-paper px-4 py-2 text-xs text-moss-forest/60 shadow-soft-sm sm:flex">
            <ClockIcon className="h-3.5 w-3.5 text-moss-leaf" />
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
        className="mt-8 overflow-hidden rounded-[2rem] border border-moss-mist/70 bg-linear-to-br from-moss-mist/60 via-moss-paper to-moss-paper p-7 shadow-soft sm:p-9"
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-moss-forest/60 uppercase">
              Status tanaman
            </p>
            <motion.p
              key={plantValue}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 text-4xl font-semibold tracking-tight text-moss-forest sm:text-5xl"
            >
              {plantValue}
            </motion.p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-moss-forest/60">
              Diterjemahkan dari kolom status (1 = Sehat, 2 = Sakit, 3 = Mati).
            </p>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-moss-paper p-5 shadow-soft-sm">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-moss-mist/50 text-moss-forest">
              <SproutIcon className="h-6 w-6" />
            </span>
            <Link
              href="/dashboard/status-tanaman"
              className="flex items-center gap-1.5 text-xs font-semibold text-moss-forest underline decoration-moss-leaf decoration-2 underline-offset-2"
            >
              Lihat detail <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="mt-8">
        <p className="text-xs font-medium tracking-wide text-moss-forest/60 uppercase">
          Pembacaan terbaru
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <p className="text-xs font-medium tracking-wide text-moss-forest/60 uppercase">
          Jelajahi sensor
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            href="/dashboard/air-quality"
            className="flex items-center gap-2 rounded-full border border-moss-mist bg-moss-paper px-4 py-2.5 text-xs font-medium text-moss-forest shadow-soft-sm"
          >
            <span>Air Quality</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-moss-leaf" />
          </Link>
          <Link
            href="/dashboard/kelembapan"
            className="flex items-center gap-2 rounded-full border border-moss-mist bg-moss-paper px-4 py-2.5 text-xs font-medium text-moss-forest shadow-soft-sm"
          >
            <span>Kelembapan</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-moss-leaf" />
          </Link>
          <Link
            href="/dashboard/kecepatan-fan"
            className="flex items-center gap-2 rounded-full border border-moss-mist bg-moss-paper px-4 py-2.5 text-xs font-medium text-moss-forest shadow-soft-sm"
          >
            <span>Kecepatan Fan</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-moss-leaf" />
          </Link>
          <Link
            href="/dashboard/kecerahan"
            className="flex items-center gap-2 rounded-full border border-moss-mist bg-moss-paper px-4 py-2.5 text-xs font-medium text-moss-forest shadow-soft-sm"
          >
            <span>Kecerahan LED</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-moss-leaf" />
          </Link>
          <Link
            href="/dashboard/status-tanaman"
            className="flex items-center gap-2 rounded-full border border-moss-mist bg-moss-paper px-4 py-2.5 text-xs font-medium text-moss-forest shadow-soft-sm"
          >
            <span>Status Tanaman</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-moss-leaf" />
          </Link>
        </div>
      </motion.section>

      <motion.footer
        variants={itemVariants}
        className="mt-10 border-t border-moss-mist/70 pt-6 text-center text-xs text-moss-forest/50"
      >
        Device {latest?.device_id ?? "—"} · Realtime via Supabase
      </motion.footer>
    </motion.main>
  );
}
