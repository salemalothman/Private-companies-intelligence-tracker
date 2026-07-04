import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant shell for the company detail page — back link, logo + name header,
 * action row, the 6-stat and 4-stat card grids, tab strip, first content
 * card. Geometry mirrors the real page so hydration lands without a jump.
 */
export default function CompanyDetailLoading() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Skeleton className="h-4 w-36" />

      {/* Header: logo + name/badges + action row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-28 sm:h-8" />
          ))}
        </div>
      </div>

      {/* 6-stat card */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border p-5 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>

      {/* 4-stat card */}
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border p-5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>

      {/* Tab strip + first content card */}
      <div className="flex gap-1 rounded-[10px] bg-muted p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
