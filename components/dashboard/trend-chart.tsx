"use client";

import { useId } from "react";
import { motion } from "motion/react";

export type TrendSeries = {
  name: string;
  /** Nilai per entri (urut lama → baru). Null/NaN di-skip. */
  values: Array<number | null>;
};

type TrendPoint = { x: number; y: number; value: number };

type TrendChartProps = {
  title: string;
  subtitle?: string;
  series: TrendSeries[];
  className?: string;
};

const WIDTH = 640;
const HEIGHT = 180;
const PADDING = 18;
const SERIES_COLORS = ["var(--forest-lime)", "var(--forest-mist)"];

function toPoints(values: number[]): TrendPoint[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values.map((value, index) => ({
    x: PADDING + (index / (values.length - 1)) * (WIDTH - PADDING * 2),
    y: HEIGHT - PADDING - ((value - min) / range) * (HEIGHT - PADDING * 2),
    value,
  }));
}

function toLinePath(points: TrendPoint[]): string {
  return points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`,
    )
    .join(" ");
}

/** Grafik garis generik (1–2 seri) dengan animasi Motion. */
export function TrendChart({
  title,
  subtitle,
  series,
  className = "",
}: TrendChartProps) {
  const gradientId = useId().replace(/:/g, "");

  const prepared = series.slice(0, 2).map((item, index) => {
    const numeric = item.values.filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
    return {
      name: item.name,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      points: numeric.length ? toPoints(numeric) : [],
    };
  });

  const drawable = prepared.filter((item) => item.points.length >= 2);
  const allPoints = prepared.flatMap((item) => item.points);
  const areaPath =
    drawable.length && drawable[0].points.length >= 2
      ? `${toLinePath(drawable[0].points)} L ${drawable[0].points[drawable[0].points.length - 1].x} ${HEIGHT - PADDING} L ${drawable[0].points[0].x} ${HEIGHT - PADDING} Z`
      : "";

  const minValue = allPoints.length ? Math.min(...allPoints.map((p) => p.value)) : 0;
  const maxValue = allPoints.length ? Math.max(...allPoints.map((p) => p.value)) : 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={`rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6 shadow-glass ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-forest-mist/70 uppercase">
            {subtitle ?? "Tren pembacaan"}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-forest-mist">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {prepared.map((item) => (
            <span
              key={item.name}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-forest-mist/80"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: item.color }}
              />
              {item.name}
            </span>
          ))}
        </div>
      </div>

      {drawable.length ? (
        <div className="mt-6 overflow-hidden rounded-2xl bg-white/10 p-2 shadow-glass-inset">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-48 w-full"
            role="img"
            aria-label={`Grafik ${title}`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--forest-lime)" stopOpacity="0.55" />
                <stop offset="100%" stopColor="var(--forest-fern)" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {areaPath && (
              <motion.path
                d={areaPath}
                fill={`url(#${gradientId})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.3 }}
              />
            )}

            {drawable.map((item, seriesIndex) => (
              <motion.path
                key={item.name}
                d={toLinePath(item.points)}
                fill="none"
                stroke={item.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{
                  duration: 1.1,
                  delay: 0.2 * seriesIndex,
                  ease: "easeInOut",
                }}
              />
            ))}

            {drawable.map((item, seriesIndex) => {
              const last = item.points[item.points.length - 1];
              return (
                <motion.circle
                  key={`${item.name}-dot`}
                  cx={last.x}
                  cy={last.y}
                  r={5}
                  fill="var(--forest-night)"
                  stroke={item.color}
                  strokeWidth={3}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    delay: 0.9 + 0.2 * seriesIndex,
                    type: "spring",
                  }}
                />
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="mt-6 flex h-48 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/10 text-sm text-forest-mist/70">
          Belum ada data numerik yang cukup untuk grafik.
        </div>
      )}

      {drawable.length > 0 && (
        <div className="mt-4 flex items-center justify-between text-xs text-forest-mist/70">
          <span>
            Min <strong className="text-forest-mist">{minValue}</strong>
          </span>
          <span>
            Maks <strong className="text-forest-mist">{maxValue}</strong>
          </span>
        </div>
      )}
    </motion.section>
  );
}
