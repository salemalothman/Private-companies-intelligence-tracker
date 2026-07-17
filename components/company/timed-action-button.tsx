"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { m } from "motion/react";
import { Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ProgressCountdown,
  recordObservedDuration,
  type CountdownKind,
} from "@/components/company/progress-countdown";
import { cn } from "@/lib/utils";

// Each staged pending label shows this long before advancing to the next.
const STAGE_STEP_MS = 1200;
// The success ("done") state lingers this long before reverting to idle.
const DONE_LINGER_MS = 2000;

type TimedActionButtonProps = {
  /** The long-running server action; resolves to `{ error }` on failure. */
  action: () => Promise<{ error?: string }>;
  /** Countdown/estimate bucket — drives the footer ETA + observed-duration key. */
  kind: CountdownKind;
  idleLabel: string;
  doneLabel: string;
  /**
   * Pending label — a single string, or a sequence the button steps through
   * (~1.2s each) so one long pass reads as staged progress, not a frozen spinner.
   */
  pendingLabel: string | readonly string[];
  /** Icon shown while idle and pending (Check replaces it on success). */
  idleIcon: LucideIcon;
  /** Animation class applied to the idle icon while pending (spin / pulse). */
  pendingIconClassName: string;
  /** Extra class on the success Check (e.g. text-success), else inherits color. */
  doneIconClassName?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  title?: string;
};

/**
 * Shared scaffolding for the long (~7 min) Sync and Deep-dive header actions:
 * owns the useTransition run, start-time capture, success-only
 * recordObservedDuration, the transient done state (with an unmount-safe timer),
 * the optional staged pending label, the accessible status label (role="status"
 * + aria-live so screen-reader users hear "Syncing…"/"Analysing…"/"Done"), and
 * the <ProgressCountdown> ETA footer. Callers supply only the action, kind,
 * icon, and labels. router.refresh() runs on success so the revalidated server
 * render surfaces the new data.
 *
 * Client-only: `idleIcon` is a Lucide component prop, so callers must also be
 * client components (forwardRef icons can't cross the server→client boundary).
 */
export function TimedActionButton({
  action,
  kind,
  idleLabel,
  doneLabel,
  pendingLabel,
  idleIcon: IdleIcon,
  pendingIconClassName,
  doneIconClassName,
  variant = "outline",
  size = "sm",
  title,
}: TimedActionButtonProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const startRef = useRef<number | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stages = Array.isArray(pendingLabel) ? pendingLabel : [pendingLabel];

  // Advance the staged pending label while running; reset once it settles.
  useEffect(() => {
    if (!pending) {
      setStage(0);
      return;
    }
    if (stages.length <= 1) return;
    const t = setTimeout(
      () => setStage((s) => Math.min(s + 1, stages.length - 1)),
      STAGE_STEP_MS,
    );
    return () => clearTimeout(t);
  }, [pending, stage, stages.length]);

  // Clear the lingering done-timer on unmount so it never fires post-teardown.
  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  function run() {
    setError(null);
    setDone(false);
    startRef.current = Date.now();
    start(async () => {
      const res = await action();
      if (res.error) {
        setError(res.error);
      } else {
        // Record the observed run time so the countdown adapts next time —
        // only on success, never on the error path.
        if (startRef.current != null) {
          recordObservedDuration(kind, Date.now() - startRef.current);
          startRef.current = null;
        }
        setDone(true);
        router.refresh();
        doneTimer.current = setTimeout(() => setDone(false), DONE_LINGER_MS);
      }
    });
  }

  const label = pending
    ? stages[Math.min(stage, stages.length - 1)]
    : done
      ? doneLabel
      : idleLabel;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {error && (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        )}
        <Button
          size={size}
          variant={variant}
          onClick={run}
          disabled={pending}
          title={title}
        >
          {done ? (
            // Spring pop on success — the label always accompanies it, so
            // reduced-motion users still get the state change.
            <m.span
              className="inline-flex"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 600, damping: 20 }}
            >
              <Check className={cn("h-3.5 w-3.5", doneIconClassName)} />
            </m.span>
          ) : (
            <IdleIcon
              className={cn("h-3.5 w-3.5", pending && pendingIconClassName)}
            />
          )}
          {/* The button's label carries the busy/progress semantics for AT
              (role="status" + aria-live announces stage changes); the footer
              countdown stays aria-hidden so nothing double-announces. */}
          <span role="status" aria-live="polite" aria-busy={pending}>
            {label}
          </span>
        </Button>
      </div>
      <ProgressCountdown running={pending} kind={kind} />
    </div>
  );
}
