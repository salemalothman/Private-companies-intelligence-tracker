import type { PortfolioEventType } from "@/lib/types";
import { classifyNews } from "@/lib/news/classify";
import { formatCurrency, formatPercent } from "@/lib/utils";

export interface BuiltEvent {
  type: PortfolioEventType;
  title: string;
  detail?: string;
  source?: string;
  occurredAt?: string;
  /** Absolute valuation-move fraction (e.g. 2.0 = +200%), for thresholding. */
  magnitude?: number;
}

export interface AlertPreferences {
  /** Which event types to record; undefined = all. */
  types?: PortfolioEventType[];
  /** Minimum |valuation change %| worth recording (0 = record all). */
  valuationMinPct?: number;
}

export interface IngestEventInput {
  rounds: {
    round: string;
    date?: string | null;
    amountRaised?: number | null;
    valuation?: number | null;
    source?: string | null;
  }[];
  valuations: {
    date: string;
    post_money: number;
    round: string | null;
    source: string;
  }[];
  news: {
    title: string;
    summary?: string | null;
    sentiment?: string | null;
    date?: string | null;
    source?: string | null;
    category?: string | null;
  }[];
  competitors: { name: string; valuation?: number | null; source?: string | null }[];
  /** Most recent post-money before this batch, to compute valuation deltas. */
  previousPostMoney?: number | null;
  /** Per-user preferences — mutes types and sub-threshold valuation moves. */
  prefs?: AlertPreferences;
}

/**
 * Pure: turn the newly-ingested entities into material activity-feed events.
 * Only signal-rich changes become events — new funding rounds, valuation moves
 * (with delta vs the prior mark), contract wins, and newly-tracked competitors.
 * Generic news is intentionally excluded (it already lives on the News tab).
 */
export function buildIngestEvents(input: IngestEventInput): BuiltEvent[] {
  const events: BuiltEvent[] = [];

  for (const r of input.rounds) {
    const parts = [
      r.amountRaised != null ? `${formatCurrency(r.amountRaised)} raised` : null,
      r.valuation != null ? `at ${formatCurrency(r.valuation)}` : null,
    ].filter(Boolean);
    events.push({
      type: "funding_round",
      title: `New round: ${r.round}`,
      detail: parts.length ? parts.join(" ") : undefined,
      source: r.source ?? undefined,
      occurredAt: r.date ?? undefined,
    });
  }

  for (const v of input.valuations) {
    const prev = input.previousPostMoney;
    const delta =
      prev != null && prev > 0 ? (v.post_money - prev) / prev : null;
    events.push({
      type: "valuation",
      title: `Valuation ${formatCurrency(v.post_money)}${v.round ? ` · ${v.round}` : ""}`,
      detail:
        delta != null && delta !== 0
          ? `${formatPercent(delta, { signed: true })} vs prior mark`
          : undefined,
      source: v.source,
      occurredAt: v.date,
      magnitude: delta != null ? Math.abs(delta) : undefined,
    });
  }

  for (const n of input.news) {
    const category = n.category ?? classifyNews(n.title, n.summary);
    if (category !== "contract") continue; // only material deals/contract wins
    events.push({
      type: "contract_win",
      title: n.title,
      detail: n.sentiment ? `${n.sentiment} sentiment` : undefined,
      source: n.source ?? undefined,
      occurredAt: n.date ?? undefined,
    });
  }

  for (const c of input.competitors) {
    events.push({
      type: "competitor",
      title: `New competitor tracked: ${c.name}`,
      detail: c.valuation != null ? formatCurrency(c.valuation) : undefined,
      source: c.source ?? undefined,
    });
  }

  return applyPrefs(events, input.prefs);
}

/** Drop muted event types and sub-threshold valuation moves. */
function applyPrefs(events: BuiltEvent[], prefs?: AlertPreferences): BuiltEvent[] {
  if (!prefs) return events;
  const min = prefs.valuationMinPct ?? 0;
  return events.filter((e) => {
    if (prefs.types && !prefs.types.includes(e.type)) return false;
    // Threshold applies only to valuation moves that have a measurable delta;
    // a first/initial valuation (no prior, magnitude undefined) is always kept.
    if (e.type === "valuation" && e.magnitude != null && e.magnitude * 100 < min) {
      return false;
    }
    return true;
  });
}
