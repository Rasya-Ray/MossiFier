"use client";

import { motion } from "motion/react";
import { formatDateTime } from "@/lib/format";
import { formatSensorValue } from "@/lib/sensors";
import { ClockIcon } from "@/components/dashboard/icons";
import { containerVariants, itemVariants } from "@/components/dashboard/motion-variants";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { LiveStatus } from "@/components/dashboard/live-status";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { useRealtimeSensors } from "@/components/dashboard/use-realtime";
import { useDevice } from "@/components/device/device-provider";
import { NoDevice } from "@/components/device/no-device";

/** Air Quality = kualitas udara + CO₂ dalam/luar ruangan. */
export function AirQualityView() {
  const { deviceId, ready } = useDevice();
  const live = useRealtimeSensors();

  if (!ready) return <DashboardSkeleton />;
  if (!deviceId) return <NoDevice />;
  if (live.isFetching && !live.latest) return <DashboardSkeleton />;

  const latest = live.latest;

  return (
    <motion.main
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:px-8 sm:pt-10 sm:pb-12"
    >
      <motion.header
        variants={itemVariants}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <p className="text-xs font-medium tracking-wide text-forest-mist/70 uppercase">
            Sensor detail
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-forest-mist sm:text-3xl">
            Air Quality
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-forest-mist/70">
            Kualitas udara dan kadar CO₂ dalam maupun luar ruangan, digabung
            dalam satu tampilan.
          </p>
        </div>
        <LiveStatus
          isFetching={live.isFetching}
          lastUpdated={live.lastUpdated}
          readingAt={latest?.created_at}
          error={live.error}
        />
      </motion.header>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Kualitas Udara"
          value={formatSensorValue(latest?.air_quality, "air_quality")}
          hint="Pembacaan sensor kualitas udara"
        />
        <StatCard
          label="CO₂ In"
          value={formatSensorValue(latest?.co2_in, "co2_in")}
          hint="Kadar CO₂ dalam ruangan"
        />
        <StatCard
          label="CO₂ Out"
          value={formatSensorValue(latest?.co2_out, "co2_out")}
          hint="Kadar CO₂ luar ruangan"
        />
      </div>

      <div className="mt-5">
        <TrendChart
          title="Perbandingan CO₂ In vs Out"
          subtitle="Riwayat terkini"
          series={[
            {
              name: "CO₂ In",
              values: live.readings.map((reading) => reading.co2_in),
            },
            {
              name: "CO₂ Out",
              values: live.readings.map((reading) => reading.co2_out),
            },
          ]}
        />
      </div>

      <motion.div
        variants={itemVariants}
        className="mt-5 flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-xs text-forest-mist/80 shadow-glass-inset"
      >
        <ClockIcon className="h-4 w-4 shrink-0 text-forest-lime" />
        Data terakhir: {formatDateTime(latest?.created_at)}
      </motion.div>
    </motion.main>
  );
}
