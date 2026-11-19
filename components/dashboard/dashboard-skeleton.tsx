import {
  Skeleton,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  SkeletonChart,
  SkeletonCircle,
  SkeletonStatCard,
  SkeletonText,
} from "@/components/ui";

/**
 * Contoh komposisi skeleton generik untuk halaman dashboard.
 * Primitifnya ada di `components/ui/skeleton.tsx` dan bisa dipakai di halaman lain.
 */
export function DashboardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SkeletonAvatar size={44} />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-20 rounded-full" />
          <SkeletonButton />
        </div>
      </div>

      <SkeletonCard className="mt-8 p-7 sm:p-10">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-4 h-9 w-full max-w-xl" />
        <Skeleton className="mt-2 h-9 w-3/4 max-w-lg" />
        <SkeletonText
          lines={2}
          className="mt-5 max-w-lg"
          widths={["w-full", "w-2/3"]}
        />
        <Skeleton className="mt-6 h-9 w-48 rounded-full" />
      </SkeletonCard>

      <div className="mt-10">
        <Skeleton className="h-5 w-40" />
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonStatCard key={index} delay={index * 0.06} />
        ))}
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <SkeletonChart bars={7} className="md:col-span-2" />
        <SkeletonCard>
          <Skeleton className="h-3 w-28" />
          <div className="mt-6 flex items-center gap-3">
            <SkeletonCircle size={12} />
            <Skeleton className="h-6 w-40" />
          </div>
          <Skeleton className="mt-14 h-12 w-full rounded-2xl" />
          <Skeleton className="mt-3 h-3 w-32" />
        </SkeletonCard>
      </div>
    </main>
  );
}
