"use client";

import { motion } from "motion/react";
import { formatDateTime } from "@/lib/format";
import {
  SENSOR_DESCRIPTIONS,
  SENSOR_LABELS,
  formatSensorValue,
  historyValues,
  readingValue,
  type SensorFieldKey,
} from "@/lib/sensors";
import { ClockIcon } from "@/components/dashboard/icons";
import { containerVariants, itemVariants } from "@/components/dashboard/motion-variants";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { LiveStatus } from "@/components/dashboard/live-status";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { useRealtimeSensors } from "@/components/dashboard/use-realtime";
import { useDevice } from "@/components/device/device-provider";
import { NoDevice } from "@/components/device/no-device";

type FieldViewProps = {
  sensorKey: SensorFieldKey;
  subtitle?: string;
};

export function FieldView({ sensorKey, subtitle }: FieldViewProps) {
  const { deviceId, ready } = useDevice();
  const live = useRealtimeSensors();

  if (!ready) return <DashboardSkeleton />;
  if (!deviceId) return <NoDevice />;
  if (live.isFetching && !live.latest) return <DashboardSkeleton />;

  const title = SENSOR_LABELS[sensorKey];
  const description = SENSOR_DESCRIPTIONS[sensorKey];
  const latest = readingValue(live.latest, sensorKey);
  const isStatus = sensorKey === "status";

  const readings = [...live.readings].reverse().slice(0, 6);

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
          {!isStatus && (
            <p className="text-xs font-medium tracking-wide text-forest-mist/70 uppercase">
              {subtitle ?? "Detail sensor"}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-semibold text-forest-mist sm:text-3xl">
            {title}
          </h1>
          {!isStatus && (
            <p className="mt-2 max-w-xl text-sm leading-6 text-forest-mist/70">
              {description}
            </p>
          )}
        </div>
        <LiveStatus
          isFetching={live.isFetching}
          lastUpdated={live.lastUpdated}
          error={live.error}
        />
      </motion.header>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {/* Nilai terbaru */}
        <motion.section
          variants={itemVariants}
          className={`flex flex-col rounded-3xl border border-white/20 bg-linear-to-br from-white/20 via-white/10 to-white/5 p-5 shadow-glass sm:p-6 ${
            isStatus ? "lg:col-span-3" : ""
          }`}
        >
          <p className="text-xs font-medium tracking-wide text-forest-mist/70 uppercase">
            Pembacaan terbaru
          </p>
          <motion.p
            key={formatSensorValue(latest, sensorKey)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-4 text-3xl font-semibold tracking-tight break-words text-forest-mist sm:text-4xl"
          >
            {formatSensorValue(latest, sensorKey)}
          </motion.p>
          <div className="mt-auto pt-8">
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-xs text-forest-mist/80 shadow-glass-inset">
              <ClockIcon className="h-4 w-4 shrink-0 text-forest-lime" />
              Diperbarui {formatDateTime(live.latest?.created_at)}
            </div>
          </div>
        </motion.section>

        {!isStatus && (
          <TrendChart
            title={title}
            subtitle="Riwayat terkini"
            className="lg:col-span-2"
            series={[
              {
                name: title,
                values: historyValues(live.readings, sensorKey),
              },
            ]}
          />
        )}
      </div>

      {/* Riwayat */}
      <motion.section
        variants={itemVariants}
        className="mt-5 rounded-3xl border border-white/20 bg-white/10 p-5 shadow-glass backdrop-blur-xl sm:p-6"
      >
        <p className="text-xs font-medium tracking-wide text-forest-mist/70 uppercase">
          Entri terakhir
        </p>
        {readings.length === 0 ? (
          <p className="mt-4 text-sm text-forest-mist/70">
            Belum ada data yang masuk dari perangkat.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {readings.map((reading) => (
              <li
                key={reading.id}
                className="flex items-start justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm shadow-glass-sm"
              >
                <span className="min-w-0 text-xs text-forest-mist/70 sm:text-sm">
                  {formatDateTime(reading.created_at)}
                </span>
                <strong className="shrink-0 text-right text-forest-mist">
                  {formatSensorValue(readingValue(reading, sensorKey), sensorKey)}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </motion.main>
  );
}
