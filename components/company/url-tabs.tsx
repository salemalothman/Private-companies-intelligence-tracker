"use client";

import { useCallback, type ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsActiveValueProvider } from "@/components/ui/tabs";

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
  resolve,
  children,
  ...props
}: Omit<ComponentProps<typeof Tabs>, "value" | "onValueChange" | "defaultValue"> & {
  param?: string;
  values: readonly string[];
  defaultValue: string;
  /**
   * Optional alias resolver applied BEFORE the allow-list check — lets legacy
   * param values (the pre-grouping 9 tab names) keep deep-linking after a
   * rename/regroup instead of silently falling back to the default. Writes
   * always emit canonical values, so a legacy URL self-heals on first click.
   */
  resolve?: (raw: string | null) => string | null;
}) {
  const searchParams = useSearchParams();
  const raw0 = searchParams.get(param);
  const raw = resolve ? resolve(raw0) : raw0;
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
    // The provider powers the springing active-tab pill in TabsTrigger; plain
    // Tabs consumers elsewhere keep the static CSS pill.
    <TabsActiveValueProvider value={value}>
      <Tabs {...props} value={value} onValueChange={onValueChange}>
        {children}
      </Tabs>
    </TabsActiveValueProvider>
  );
}
