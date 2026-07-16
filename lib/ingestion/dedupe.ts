import type { ConnectorFundingRound } from "@/lib/connectors/types";
import type { FundingRoundRow, ValuationRow } from "@/lib/types";

/**
 * Funding-round / valuation de-duplication.
 *
 * Different connectors describe the same financing event with different round
 * names ("Series D" vs "Undisclosed" vs "Funding (Exa)") and slightly different
 * announcement dates, producing several near-identical rows. This merges any
 * records that share the same post-money valuation AND land within a short date
 * window into one — keeping the most explicitly-named entry and folding the
 * others' metadata in.
 */

const WINDOW_DAYS = 3;

/** Named rounds are most explicit; placeholders are least. */
const NAMED = /\b(series\s+[a-k]|seed|pre-seed|angel|reg\s*[a-d])\b/i;
const PLACEHOLDER =
  /^(undisclosed|unknown|funding(\s*\(.*\))?|secondary(\s*\(.*\))?|reg d(\s*\(.*\))?|valuation update|entry|—|-)?$/i;

function explicitness(round: string | null | undefined): number {
  const r = (round ?? "").trim();
  if (NAMED.test(r)) return 2;
  if (!r || PLACEHOLDER.test(r)) return 0;
  return 1; // a real but generic name (e.g. "Tender", "Primary")
}

function withinDays(a?: string | null, b?: string | null, n = WINDOW_DAYS): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) / 86_400_000 <= n;
}

export const uniqStrings = (xs: (string | null | undefined)[]): string[] => [
  ...new Set(xs.map((x) => x?.trim()).filter(Boolean) as string[]),
];

/** Union two investor lists, or null when both are empty. */
export function mergeInvestors(
  a?: string[] | null,
  b?: string[] | null,
): string[] | null {
  const u = uniqStrings([...(a ?? []), ...(b ?? [])]);
  return u.length ? u : null;
}

/** Combine comma-or-source-joined provenance strings into a distinct set. */
export function mergeSource(a?: string | null, b?: string | null): string | null {
  const u = uniqStrings([...(a?.split(",") ?? []), ...(b?.split(",") ?? [])]);
  return u.length ? u.join(", ") : null;
}

interface Accessors<T> {
  round: (t: T) => string | null | undefined;
  date: (t: T) => string | null | undefined;
  /** The valuation used for matching (post-money). */
  /**
   * Match keys — records sharing ANY key (plus the date window) describe the
   * same event. Funding rows key on BOTH post-money valuation ("v:…") and
   * amount raised ("a:…"), in separate keyspaces so a $65B raise never
   * collides with a $65B valuation. Rationale: an unnamed connector event
   * that reports only the amount ("Funding (Exa)", raised $65B, no valuation)
   * must still fold into the named round of the same raise ("Series H",
   * raised $65B, $965B post) — matching on valuation alone missed exactly
   * that pair.
   */
  keys: (t: T) => (string | null | undefined)[];
  merge: (primary: T, dup: T) => T;
  windowDays?: number;
  /**
   * Optional source-preference score (higher = kept as primary), applied BEFORE
   * explicitness/date so a preferred source (e.g. akta) wins a duplicate
   * collision regardless of round-name explicitness. Defaults to 0 when absent.
   */
  prefer?: (t: T) => number;
}

/**
 * Generic merge: group records that share any match key and fall within the
 * date window, keep the most explicitly-named as primary (tie → earliest date),
 * and fold the rest in via `merge`. Records without a date or any key are
 * never grouped (we can't confirm they're the same event), so they pass
 * through.
 */
export function dedupeBy<T>(items: T[], acc: Accessors<T>): T[] {
  const win = acc.windowDays ?? WINDOW_DAYS;
  const groups: T[][] = [];
  const keysOf = (t: T) => acc.keys(t).filter((k): k is string => k != null);

  for (const item of items) {
    const ks = keysOf(item);
    const d = acc.date(item);
    const group =
      ks.length && d
        ? groups.find((g) =>
            g.some(
              (m) =>
                keysOf(m).some((k) => ks.includes(k)) &&
                withinDays(acc.date(m), d, win),
            ),
          )
        : undefined;
    if (group) group.push(item);
    else groups.push([item]);
  }

  return groups.map((g) => {
    if (g.length === 1) return g[0];
    const sorted = [...g].sort(
      (a, b) =>
        (acc.prefer?.(b) ?? 0) - (acc.prefer?.(a) ?? 0) ||
        explicitness(acc.round(b)) - explicitness(acc.round(a)) ||
        Date.parse(acc.date(a) ?? "") - Date.parse(acc.date(b) ?? ""),
    );
    return sorted.slice(1).reduce((primary, dup) => acc.merge(primary, dup), sorted[0]);
  });
}

/** Namespaced money key ("v:965000000000") or null when the figure is absent. */
const moneyKey = (space: "v" | "a", n: number | null | undefined): string | null =>
  n == null ? null : `${space}:${n}`;

/** Dedupe connector funding rounds (pre-DB). */
export function dedupeConnectorRounds(
  rounds: ConnectorFundingRound[],
): ConnectorFundingRound[] {
  return dedupeBy(rounds, {
    round: (r) => r.round,
    date: (r) => r.date,
    prefer: (r) => (/akta/i.test(r.source ?? "") ? 1 : 0),
    keys: (r) => [moneyKey("v", r.valuation), moneyKey("a", r.amountRaised)],
    merge: (p, d) => ({
      ...p,
      amountRaised: p.amountRaised ?? d.amountRaised,
      valuation: p.valuation ?? d.valuation,
      investors: mergeInvestors(p.investors, d.investors) ?? undefined,
      leadInvestor: p.leadInvestor ?? d.leadInvestor,
      source: mergeSource(p.source, d.source) ?? p.source,
    }),
  });
}

/** Dedupe stored funding-round rows (render-time). */
export function dedupeFundingRows(rows: FundingRoundRow[]): FundingRoundRow[] {
  return dedupeBy(rows, {
    round: (r) => r.round,
    date: (r) => r.date,
    prefer: (r) => (/akta/i.test(r.source ?? "") ? 1 : 0),
    keys: (r) => [moneyKey("v", r.valuation), moneyKey("a", r.amount_raised)],
    merge: (p, d) => ({
      ...p,
      amount_raised: p.amount_raised ?? d.amount_raised,
      valuation: p.valuation ?? d.valuation,
      investors: mergeInvestors(p.investors, d.investors),
      lead_investor: p.lead_investor ?? d.lead_investor,
      share_price: p.share_price ?? d.share_price,
      source: mergeSource(p.source, d.source),
    }),
  });
}

/** Dedupe stored valuation rows (render-time) — matched on post-money. */
export function dedupeValuationRows(rows: ValuationRow[]): ValuationRow[] {
  return dedupeBy(rows, {
    round: (r) => r.round,
    date: (r) => r.date,
    prefer: (r) => (/akta/i.test(r.source ?? "") ? 1 : 0),
    keys: (r) => [moneyKey("v", r.post_money)],
    merge: (p, d) => ({
      ...p,
      pre_money: p.pre_money ?? d.pre_money,
      post_money: p.post_money ?? d.post_money,
      share_price: p.share_price ?? d.share_price,
      source: mergeSource(p.source, d.source),
    }),
  });
}
