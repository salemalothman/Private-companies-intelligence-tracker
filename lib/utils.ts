import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Bare hostname from a website URL — protocol-defaulted (so bare "openai.com"
 * parses), `www.` stripped, null when absent or unparseable. One client-safe
 * copy shared by the logo/favicon builders across the typeahead, Add Company
 * dialog, and enrichment, replacing the several inline duplicates that had
 * drifted. (sanitize-sources.ts keeps its own normalizer — different semantics.)
 */
export function hostFromWebsite(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Return `raw` only if it is a syntactically valid absolute http/https URL,
 * else undefined. An XSS guard for any value that may end up in an `href` or be
 * re-rendered: `javascript:`, `data:`, `vbscript:`, and protocol-relative
 * (`//evil`) or scheme-less (`evil.com`) strings all return undefined, so only a
 * benign http(s) URL survives. Valid http(s) URLs pass through byte-identical
 * (aside from surrounding-whitespace trimming) — behavior-preserving for the
 * real news/article URLs the connectors emit.
 */
export function safeHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Format a number as compact USD, e.g. 1_200_000 -> "$1.20M".
 *
 * Implemented manually rather than via Intl `notation: "compact"`, whose output
 * differs between Node's ICU and the browser's ("$9.00B" vs "$9B") and so caused
 * SSR/client hydration mismatches in client components.
 */
export function formatCurrency(
  value: number | null | undefined,
  opts: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (opts.compact === false) {
    // Grouped integer dollars — comma grouping is ICU-stable across runtimes.
    return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
  }

  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [base, suffix] of units) {
    if (abs >= base) return `${sign}$${(abs / base).toFixed(2)}${suffix}`;
  }
  return `${sign}$${abs.toFixed(2)}`;
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

/** Multiple on invested capital, e.g. 1.73 -> "1.73x". */
export function formatMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}x`;
}

/** Tiny percentages (ownership), 4 decimals: 0.000888 -> "0.0888%". */
export function formatTinyPercent(
  fraction: number | null | undefined,
): string {
  if (fraction === null || fraction === undefined || Number.isNaN(fraction))
    return "—";
  return `${(fraction * 100).toFixed(4)}%`;
}

/** Signed dollars in millions with accounting parens: -400000 -> "($0.4M)". */
export function formatMillionsSigned(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const m = value / 1_000_000;
  const s = `$${Math.abs(m).toFixed(1)}M`;
  return value < 0 ? `(${s})` : s;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  // Force UTC so a date-only value renders identically on the server and the
  // client regardless of either's timezone — prevents SSR/hydration mismatches.
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
