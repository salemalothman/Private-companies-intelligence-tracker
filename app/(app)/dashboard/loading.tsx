import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant shell for the dashboard — geometry mirrors the real page (4 KPI
 * cards with chip/number/sparkline stubs, 2/3+1/3 chart row, full-width
 * performers, then section bars) so the loaded content replaces it without a
 * jump.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* PageHeader: title + subtitle + two actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* KPI cards — chip, figure, label + sparkline slot */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border p-5"
          >
            <div className="space-y-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-12 w-24" />
          </div>
        ))}
      </div>

      {/* Chart row: 2/3 hero + 1/3 radial, then full-width performers */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-3" />
      </div>

      {/* Section bars (valuation changes, events, activity) */}
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
