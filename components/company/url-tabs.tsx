"use client";

import { useCallback, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

/**
 * Tabs whose active value lives in a `?tab=` search param, so the selected tab
 * survives refresh and is deep-linkable/shareable (URL reflects state — the
 * pattern Stripe/Uber dashboards use for view segments).
 *
 * Uses `window.history.replaceState` for the write: Next.js (14.1+) keeps
 * `useSearchParams` in sync with shallow history updates, so switching tabs
 * costs no server round-trip and doesn't spam the history stack (Back leaves
 * the page rather than replaying every tab click). The param is validated
 * against `values` — an unknown `?tab=` falls back to `defaultValue` instead
 * of rendering no panel — and the default tab keeps a clean, param-free URL.
 */
export function UrlTabs({
  param = "tab",
  values,
  defaultValue,
  children,
  ...props
}: Omit<ComponentProps<typeof Tabs>, "value" | "onValueChange" | "defaultValue"> & {
  param?: string;
  values: readonly string[];
  defaultValue: string;
}) {
  const searchParams = useSearchParams();
  const raw = searchParams.get(param);
  const value = raw && values.includes(raw) ? raw : defaultValue;

  const onValueChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(window.location.search);
      if (next === defaultValue) params.delete(param);
      else params.set(param, next);
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      );
    },
    [param, defaultValue],
  );

  return (
    <Tabs {...props} value={value} onValueChange={onValueChange}>
      {children}
    </Tabs>
  );
}
