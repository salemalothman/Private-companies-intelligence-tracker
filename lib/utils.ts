import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as compact USD, e.g. 1_200_000 -> "$1.2M". */
export function formatCurrency(
  value: number | null | undefined,
  opts: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: opts.compact === false ? "standard" : "compact",
    maximumFractionDigits: opts.compact === false ? 0 : 2,
  }).format(value);
}

/** Format a fraction (0.15) as a signed percentage string ("+15.0%"). */
export function formatPercent(
  fraction: number | null | undefined,
  opts: { signed?: boolean } = {},
): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction))
    return "—";
  const pct = fraction * 100;
  const sign = opts.signed && pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
