import type { ExtractedEntities } from "@/lib/documents/heuristic";
import { formatCurrency, formatPercent } from "@/lib/utils";

/**
 * Data-room diffing: compare the structured facts extracted from two successive
 * documents (e.g. board decks) and surface what materially changed — valuation
 * moves, newly-disclosed rounds, and competitor-set changes. Pure and
 * deterministic. Observational only — no risk scoring.
 */

export type DiffDirection = "up" | "down" | "new" | "removed";

export interface DiffItem {
  kind: "valuation" | "round" | "competitor";
  direction: DiffDirection;
  label: string;
  detail?: string;
}

export interface DocumentDiff {
  changes: DiffItem[];
}

type Entities = Pick<
  ExtractedEntities,
  "fundingRounds" | "valuations" | "competitors"
>;

/** Most recent post-money valuation reported in a document, if any. */
function latestValuation(e: Entities): number | null {
  const vals = (e.valuations ?? []).filter((v) => v?.post_money != null);
  if (!vals.length) return null;
  return [...vals].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]
    .post_money;
}

const normName = (s: string) => s.trim().toLowerCase();

export function diffDocuments(prev: Entities, next: Entities): DocumentDiff {
  const changes: DiffItem[] = [];

  // Valuation move.
  const pv = latestValuation(prev);
  const nv = latestValuation(next);
  if (pv != null && nv != null && pv > 0 && nv !== pv) {
    const delta = (nv - pv) / pv;
    changes.push({
      kind: "valuation",
      direction: nv > pv ? "up" : "down",
      label: `Valuation ${formatCurrency(pv)} → ${formatCurrency(nv)}`,
      detail: `${formatPercent(delta, { signed: true })} vs previous document`,
    });
  }

  // Newly-disclosed funding rounds (by round name).
  const prevRounds = new Set(
    (prev.fundingRounds ?? []).map((r) => normName(r.round ?? "")),
  );
  for (const r of next.fundingRounds ?? []) {
    const name = r.round ?? "";
    if (!name || prevRounds.has(normName(name))) continue;
    changes.push({
      kind: "round",
      direction: "new",
      label: `New round disclosed: ${name}`,
      detail: r.amountRaised != null ? `${formatCurrency(r.amountRaised)} raised` : undefined,
    });
  }

  // Competitor-set changes.
  const prevComp = new Map(
    (prev.competitors ?? []).map((c) => [normName(c.name), c.name] as const),
  );
  const nextComp = new Map(
    (next.competitors ?? []).map((c) => [normName(c.name), c.name] as const),
  );
  for (const [key, name] of nextComp) {
    if (!prevComp.has(key))
      changes.push({ kind: "competitor", direction: "new", label: `New competitor named: ${name}` });
  }
  for (const [key, name] of prevComp) {
    if (!nextComp.has(key))
      changes.push({ kind: "competitor", direction: "removed", label: `No longer listed: ${name}` });
  }

  return { changes };
}
