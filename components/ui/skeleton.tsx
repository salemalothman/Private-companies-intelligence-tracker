import { cn } from "@/lib/utils";

/**
 * Loading placeholder: muted block with a light shimmer band sweeping across
 * (the `shimmer` keyframe in tailwind.config). Server-safe — used by the
 * route-level loading.tsx shells, which must render with zero client JS.
 * Geometry is the caller's job: skeletons must match the real layout exactly
 * so content replaces them with no jump.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-shimmer rounded-md bg-muted",
        "bg-[linear-gradient(100deg,transparent_30%,hsl(var(--background)/0.6)_50%,transparent_70%)] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}
