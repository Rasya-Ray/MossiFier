"use client";

import { motion } from "motion/react";
import { formatDateTime } from "@/lib/format";
import {
  formatSensorValue,
  readingNumber,
  sensorTrend,
} from "@/lib/sensors";
import {
  CO2_GUIDANCE,
  co2Category,
  overallAirQuality,
  pm1Category,
  pm10Category,
  pm25Category,
} from "@/lib/air-quality";
import { sensorScale } from "@/lib/scales";
import { AIR_TONE_STYLE } from "@/components/dashboard/air-tone";
import { AirReference } from "@/components/dashboard/air-reference";
import { ClockIcon } from "@/components/dashboard/icons";
import { containerVariants, itemVariants } from "@/components/dashboard/motion-variants";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { LiveStatus } from "@/components/dashboard/live-status";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { useRealtimeSensors } from "@/components/dashboard/use-realtime";
import { useDevice } from "@/components/device/device-provider";
import { NoDevice } from "@/components/device/no-device";

/**
 * Kualitas Udara = CO₂ in/out dari sensor gas + debu halus PM1.0/PM2.5/PM10.
 * Setiap kartu diberi warna & kategori supaya angkanya mudah ditafsirkan.
 */
export function AirQualityView() {
  const { deviceId, ready } = useDevice();
  const live = useRealtimeSensors();

  if (!ready) return <DashboardSkeleton />;
  if (!deviceId) return <NoDevice />;
  if (live.isFetching && !live.latest) return <DashboardSkeleton />;

  const latest = live.latest;
  const air = overallAirQuality(latest);
  const airStyle = AIR_TONE_STYLE[air?.level ?? "neutral"];

  const co2In = co2Category(latest?.co2_in);
  const co2Out = co2Category(latest?.co2_out);
  const pm1 = pm1Category(latest?.pm1);
  const pm25 = pm25Category(latest?.pm25);
  const pm10 = pm10Category(latest?.pm10);

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
            Kualitas Udara
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-forest-mist/70">
            Debu halus dan gas di sekitar perangkat. Setiap kartu punya warna
            status: hijau berarti aman, makin putih/terang berarti makin perlu
            perhatian.
          </p>
        </div>
        <LiveStatus
          isFetching={live.isFetching}
          lastUpdated={live.lastUpdated}
          readingAt={latest?.created_at}
          error={live.error}
        />
      </motion.header>

      <motion.section
        variants={itemVariants}
        className={`mt-6 rounded-3xl border p-5 shadow-glass backdrop-blur-xl sm:p-6 ${airStyle.card}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-forest-mist/70 uppercase">
              Status udara sekarang
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-forest-mist sm:text-3xl">
              {air?.label ?? "Menunggu data"}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-forest-mist/80">
              {air?.advice ??
                "Data sensor belum masuk. Pastikan perangkat menyala dan terhubung ke internet."}
            </p>
          </div>
          {air && (
            <span
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${airStyle.badge}`}
            >
              Penyebab utama: {air.driverLabel}
            </span>
          )}
        </div>
      </motion.section>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="CO₂ In"
          value={formatSensorValue(latest?.co2_in, "co2_in")}
          badge={co2In?.label}
          tone={co2In?.level}
          hint={co2In ? CO2_GUIDANCE[co2In.level].short : "Menunggu data"}
          advice="Bukan parameter ISPU — acuan ruangan"
          scale={sensorScale("co2_in")}
          rawValue={readingNumber(latest, "co2_in")}
          trend={sensorTrend(live.readings, "co2_in")}
        />
        <StatCard
          label="CO₂ Out"
          value={formatSensorValue(latest?.co2_out, "co2_out")}
          badge={co2Out?.label}
          tone={co2Out?.level}
          hint={co2Out ? CO2_GUIDANCE[co2Out.level].short : "Menunggu data"}
          advice="Bukan parameter ISPU — acuan ruangan"
          scale={sensorScale("co2_out")}
          rawValue={readingNumber(latest, "co2_out")}
          trend={sensorTrend(live.readings, "co2_out")}
        />
        <StatCard
          label="PM1.0"
          value={formatSensorValue(latest?.pm1, "pm1")}
          badge={pm1?.label}
          tone={pm1?.level}
          hint={pm1 ? pm1.short : "Menunggu data"}
          advice="Belum ada baku mutu resmi"
          scale={sensorScale("pm1")}
          rawValue={readingNumber(latest, "pm1")}
          trend={sensorTrend(live.readings, "pm1")}
        />
        <StatCard
          label="PM2.5"
          value={formatSensorValue(latest?.pm25, "pm25")}
          badge={pm25?.label}
          tone={pm25?.level}
          hint={pm25 ? pm25.short : "Menunggu data"}
          advice="WHO 2021: ≤ 15 µg/m³ (24 jam)"
          scale={sensorScale("pm25")}
          rawValue={readingNumber(latest, "pm25")}
          trend={sensorTrend(live.readings, "pm25")}
        />
        <StatCard
          label="PM10"
          value={formatSensorValue(latest?.pm10, "pm10")}
          badge={pm10?.label}
          tone={pm10?.level}
          hint={pm10 ? pm10.short : "Menunggu data"}
          advice="WHO 2021: ≤ 45 µg/m³ (24 jam)"
          scale={sensorScale("pm10")}
          rawValue={readingNumber(latest, "pm10")}
          trend={sensorTrend(live.readings, "pm10")}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <TrendChart
          title="CO₂ In vs CO₂ Out"
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
        <TrendChart
          title="PM2.5 vs PM10"
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

      <AirReference />

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
