"use client";

import {
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Primitif skeleton UI generik.
 * - Hanya memakai 4 warna tema (moss-forest / moss-leaf / moss-mist / moss-paper).
 * - Shimmer dianimasikan dengan Motion dan otomatis mati saat reduced-motion.
 * - Semua komponen menerima `className`, `delay`, dan `animate` agar mudah dipakai ulang.
 */

const subscribeToNothing = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export type SkeletonProps = {
  className?: string;
  /** Nyalakan/matikan shimmer per elemen. Default: true. */
  animate?: boolean;
  /** Delay shimmer (detik) untuk efek stagger. */
  delay?: number;
  style?: CSSProperties;
};

export function Skeleton({
  className = "",
  animate = true,
  delay = 0,
  style,
}: SkeletonProps) {
  const reduceMotion = useReducedMotion();

  // Render pertama (server + client) identik: shimmer baru jalan setelah mount.
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    getClientSnapshot,
    getServerSnapshot,
  );

  const shimmer = animate && mounted && !reduceMotion;

  return (
    <motion.div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-xl bg-moss-mist/50 ${className}`}
      style={{
        backgroundImage: shimmer
          ? "linear-gradient(90deg, var(--moss-mist) 0%, var(--moss-paper) 50%, var(--moss-mist) 100%)"
          : undefined,
        backgroundSize: shimmer ? "200% 100%" : undefined,
        ...style,
      }}
      animate={
        shimmer ? { backgroundPosition: ["200% 0%", "-200% 0%"] } : undefined
      }
      transition={
        shimmer
          ? { duration: 1.6, ease: "linear", repeat: Infinity, delay }
          : undefined
      }
    />
  );
}

export type SkeletonTextProps = SkeletonProps & {
  /** Jumlah baris teks. Default: 3. */
  lines?: number;
  /** Lebar tiap baris (Tailwind class). Baris terakhir default w-2/3. */
  widths?: string[];
};

export function SkeletonText({
  lines = 3,
  widths,
  className = "",
  delay = 0,
  animate = true,
}: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          animate={animate}
          delay={delay + index * 0.1}
          className={`h-3 ${
            widths?.[index] ?? (index === lines - 1 ? "w-2/3" : "w-full")
          }`}
        />
      ))}
    </div>
  );
}

export type SkeletonCircleProps = SkeletonProps & {
  /** Diameter dalam pixel. Default: 40. */
  size?: number;
};

export function SkeletonCircle({
  size = 40,
  className = "",
  style,
  ...rest
}: SkeletonCircleProps) {
  return (
    <Skeleton
      {...rest}
      className={`rounded-full ${className}`}
      style={{ width: size, height: size, ...style }}
    />
  );
}

export type SkeletonAvatarProps = SkeletonProps & {
  size?: number;
  lines?: number;
};

export function SkeletonAvatar({
  size = 40,
  lines = 2,
  className = "",
  delay = 0,
  animate = true,
}: SkeletonAvatarProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-hidden="true">
      <SkeletonCircle size={size} animate={animate} delay={delay} />
      <SkeletonText
        lines={lines}
        className="flex-1"
        widths={["w-3/4", "w-1/2"]}
        animate={animate}
        delay={delay + 0.1}
      />
    </div>
  );
}

export function SkeletonButton({ className = "", ...rest }: SkeletonProps) {
  return (
    <Skeleton
      {...rest}
      className={`h-9 w-28 rounded-full ${className}`}
    />
  );
}

export type SkeletonCardProps = {
  children: ReactNode;
  className?: string;
};

export function SkeletonCard({ children, className = "" }: SkeletonCardProps) {
  return (
    <div
      className={`rounded-3xl border border-moss-mist/70 bg-moss-paper p-5 shadow-soft ${className}`}
    >
      {children}
    </div>
  );
}

export function SkeletonStatCard({
  className = "",
  delay = 0,
  animate = true,
}: SkeletonProps) {
  return (
    <SkeletonCard className={className}>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-3 w-24" animate={animate} delay={delay} />
        <SkeletonCircle size={16} animate={animate} delay={delay} />
      </div>
      <Skeleton
        className="mt-4 h-8 w-20"
        animate={animate}
        delay={delay + 0.08}
      />
      <Skeleton
        className="mt-3 h-3 w-32"
        animate={animate}
        delay={delay + 0.16}
      />
    </SkeletonCard>
  );
}

export type SkeletonChartProps = SkeletonProps & {
  /** Jumlah batang grafik. Default: 7. */
  bars?: number;
};

const BAR_HEIGHTS = [42, 68, 50, 82, 60, 92, 72];

export function SkeletonChart({
  bars = 7,
  className = "",
  delay = 0,
  animate = true,
}: SkeletonChartProps) {
  return (
    <SkeletonCard className={className}>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-3 h-5 w-40" />
      <div className="mt-6 flex h-40 items-end gap-2" aria-hidden="true">
        {Array.from({ length: bars }).map((_, index) => (
          <Skeleton
            key={index}
            animate={animate}
            delay={delay + index * 0.08}
            className="flex-1 rounded-t-xl"
            style={{ height: `${BAR_HEIGHTS[index % BAR_HEIGHTS.length]}%` }}
          />
        ))}
      </div>
    </SkeletonCard>
  );
}

export type SkeletonListProps = SkeletonProps & {
  /** Jumlah baris. Default: 3. */
  rows?: number;
};

export function SkeletonList({
  rows = 3,
  className = "",
  delay = 0,
  animate = true,
}: SkeletonListProps) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          animate={animate}
          delay={delay + index * 0.08}
          className="h-12 rounded-2xl"
        />
      ))}
    </div>
  );
}
