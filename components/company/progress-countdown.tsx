"use client";

import { useEffect, useRef, useState } from "react";
import { formatRemaining } from "@/lib/format-remaining";
import { cn } from "@/lib/utils";

/**
 * Live estimated-time-remaining countdown for the long (~7 min) Sync and
 * Deep-dive actions. Renders nothing while idle; while running it shows a
 * determinate hairline bar plus a `~Xm Ys left` label that adapts to the last
 * observed duration (persisted per action kind in localStorage). On overrun it
 * degrades to an honest "wrapping up…" shimmer rather than freezing at ~0s or a
 * fake 99%. `recordObservedDuration` is the write seam the buttons call on
 * success; the component itself only READS the estimate.
 */

export type CountdownKind = "sync" | "deep-dive";

// Both actions run one end-to-end Grok pass at roughly the same cost.
const EST_DEFAULT_MS: Record<CountdownKind, number> = {
  sync: 7 * 60 * 1000,
  "deep-dive": 7 * 60 * 1000,
};

// Clamp observed durations so a fluke (an instant error, a 30-minute hang)
// never poisons the next estimate: 30s floor, 20m ceiling.
const MIN_OBSERVED_MS = 30 * 1000;
const MAX_OBSERVED_MS = 20 * 60 * 1000;

const estKey = (kind: CountdownKind) => `pct:est:${kind}`;

/**
 * Persist the observed duration of a completed run so the next countdown
 * adapts. Best-effort and SSR-safe — no-ops off the client or if storage throws.
 */
export function recordObservedDuration(kind: CountdownKind, ms: number): void {
  if (typeof window === "undefined") return;
  const clamped = Math.min(MAX_OBSERVED_MS, Math.max(MIN_OBSERVED_MS, ms));
  try {
    window.localStorage.setItem(estKey(kind), String(Math.round(clamped)));
  } catch {
    // localStorage can throw (private mode / quota) — timing UX is best-effort.
  }
}

/** Read the last observed duration, falling back to the per-kind default. */
function readEstimate(kind: CountdownKind): number {
  if (typeof window === "undefined") return EST_DEFAULT_MS[kind];
  try {
    const raw = window.localStorage.getItem(estKey(kind));
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    // fall through to the default estimate
  }
  return EST_DEFAULT_MS[kind];
}

export function ProgressCountdown({
  running,
  kind,
}: {
  running: boolean;
  kind: CountdownKind;
}) {
  const [now, setNow] = useState(0);
  const startRef = useRef<number | null>(null);
  const estRef = useRef<number>(EST_DEFAULT_MS[kind]);

  useEffect(() => {
    if (!running) {
      startRef.current = null;
      return;
    }
    // false→true transition: seed the estimate + start clock, then tick each 1s.
    estRef.current = readEstimate(kind);
    startRef.current = Date.now();
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, kind]);

  if (!running || startRef.current == null) return null;

  const est = estRef.current;
  const elapsed = Math.max(0, now - startRef.current);
  const remaining = est - elapsed;
  const overrun = elapsed >= est;
  const pct = Math.min(1, Math.max(0, elapsed / est));

  return (
    // Decorative timing hint — the button itself carries the busy/progress
    // semantics, so this stays out of the a11y tree to avoid double-announcing.
    <div className="flex flex-col gap-1" aria-hidden="true">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full bg-foreground transition-[width] duration-1000 ease-linear",
            overrun && "w-1/3 animate-pulse",
          )}
          style={overrun ? undefined : { width: `${pct * 100}%` }}
        />
      </div>
      <span className="label-eyebrow normal-case tracking-normal tabular-nums">
        {formatRemaining(remaining)}
      </span>
    </div>
  );
}
