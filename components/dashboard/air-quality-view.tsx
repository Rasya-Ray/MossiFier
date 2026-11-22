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

/** Air Quality = MQ-135 (2 sensor) + partikulat PM1.0 / PM2.5 / PM10. */
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
            Pembacaan dua sensor gas MQ-135 dan partikulat halus (PM1.0, PM2.5,
            PM10) di sekitar perangkat.
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
          label="MQ-135 #1"
          value={formatSensorValue(latest?.mq135_1, "mq135_1")}
          hint="Sensor gas utama"
        />
        <StatCard
          label="MQ-135 #2"
          value={formatSensorValue(latest?.mq135_2, "mq135_2")}
          hint="Sensor gas kedua"
        />
        <StatCard
          label="PM2.5"
          value={formatSensorValue(latest?.pm25, "pm25")}
          hint="Partikel halus < 2.5 µm"
        />
        <StatCard
          label="PM1.0"
          value={formatSensorValue(latest?.pm1, "pm1")}
          hint="Partikel ultra halus"
        />
        <StatCard
          label="PM10"
          value={formatSensorValue(latest?.pm10, "pm10")}
          hint="Partikel < 10 µm"
        />
      </div>

      <div className="mt-5">
        <TrendChart
          title="Perbandingan PM2.5 vs PM10"
          subtitle="Riwayat terkini"
          series={[
            {
              name: "PM2.5",
              values: live.readings.map((reading) => reading.pm25),
            },
            {
              name: "PM10",
              values: live.readings.map((reading) => reading.pm10),
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