import { ShieldCheck } from "lucide-react";
import type {
  CapabilityMatrix,
  CompetitorsSection,
  LabelledField,
  ThreatTier,
} from "@/lib/agents/deep-dive-types";
import type { RankedEntity } from "@/lib/competitors/rank";
import { ConfidenceChip } from "@/components/company/confidence-chip";
import { RatingIndicator } from "@/components/company/rating-indicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isPublisherDomain } from "@/lib/enrichment/sanitize-sources";
import { cn, formatCurrency, formatDate, formatMultiple } from "@/lib/utils";

/**
 * Renders the stored deep-dive `competitors` block in the Competitors tab: the
 * EXISTING competitor ranking rows grouped by threat tier (CMP-01) and a
 * Capability Matrix of the target vs. its top-3 threats scored 1–10 across four
 * capability axes via the shared `RatingIndicator` (CMP-02).
 *
 * This is a Server Component ON PURPOSE — it renders directly inside the RSC
 * page and only uses server-safe presentational primitives (`RatingIndicator`,
 * `ConfidenceChip`) plus the plain `Table` markup already used by the tab. It
 * therefore never imports a client-only `CollapsibleSection` with an icon; the
 * whole file must stay a Server Component — do not add the client directive.
 *
 * Join model / no re-discovery: the tiers/matrix CLASSIFY the already-ranked
 * competitors. We join `competitors.threat_tiers` onto the `ranking` rows by
 * name (case-insensitive); names with no tier — including the target, which is
 * never classified — fall into a visible "Unclassified" group so no row is ever
 * dropped. Every existing ranking column + behavior (rank #, target highlight,
 * latest valuation, revenue/ARR, V/R multiple, as-of, publisher source link,
 * basis tooltip, SEC-verified badge) is reproduced verbatim.
 *
 * Honesty / XSS guardrails: all Grok-originated text (narrative, competitor
 * names) is rendered as JSX children only — React auto-escapes it and we never
 * use dangerouslySetInnerHTML. Every field is optional: absence degrades (the
 * flat ranking still renders) and never crashes.
 */

/** Tier render order + human labels. "unclassified" always renders last. */
const TIER_ORDER: ThreatTier[] = ["direct", "indirect", "emerging"];

const TIER_LABEL: Record<ThreatTier | "unclassified", string> = {
  direct: "Direct threats",
  indirect: "Indirect / asymmetric",
  emerging: "Emerging / stealth",
  unclassified: "Unclassified",
};

/** The four Capability Matrix axes, in render order. */
const MATRIX_AXES: {
  label: string;
  key: "ip_depth" | "gtm_velocity" | "capital_efficiency" | "workflow_retention";
}[] = [
  { label: "IP Depth", key: "ip_depth" },
  { label: "GTM Velocity", key: "gtm_velocity" },
  { label: "Capital Efficiency", key: "capital_efficiency" },
  { label: "Workflow Retention", key: "workflow_retention" },
];

/** A ranking row paired with its continuous global rank number (1-based). */
type NumberedRow = { entity: RankedEntity; rank: number };

/**
 * Build the ordered tier groups from the ranking + tiers lookup. Rank numbers
 * come from the row's GLOBAL position in the (already valuation-sorted) ranking
 * so numbering stays continuous across groups. Empty groups are omitted.
 */
function groupByTier(
  ranking: RankedEntity[],
  tiers: Record<string, ThreatTier> | undefined,
): { tier: ThreatTier | "unclassified"; rows: NumberedRow[] }[] {
  const lookup = new Map<string, ThreatTier>();
  for (const [name, tier] of Object.entries(tiers ?? {})) {
    lookup.set(name.trim().toLowerCase(), tier);
  }

  const buckets: Record<ThreatTier | "unclassified", NumberedRow[]> = {
    direct: [],
    indirect: [],
    emerging: [],
    unclassified: [],
  };

  ranking.forEach((entity, i) => {
    const tier = entity.isTarget
      ? undefined
      : lookup.get(entity.name.trim().toLowerCase());
    buckets[tier ?? "unclassified"].push({ entity, rank: i + 1 });
  });

  const ordered: (ThreatTier | "unclassified")[] = [...TIER_ORDER, "unclassified"];
  return ordered
    .map((tier) => ({ tier, rows: buckets[tier] }))
    .filter((g) => g.rows.length > 0);
}

/** The shared ranking table header — identical columns to the flat table. */
function RankingHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-10 text-right">#</TableHead>
        <TableHead>Company</TableHead>
        <TableHead className="text-right">Latest valuation</TableHead>
        <TableHead className="text-right">Revenue / ARR</TableHead>
        <TableHead className="text-right">V / R multiple</TableHead>
        <TableHead>As of</TableHead>
        <TableHead>Source</TableHead>
        <TableHead>Basis</TableHead>
        <TableHead className="text-right">Verified</TableHead>
      </TableRow>
    </TableHeader>
  );
}

/** One ranking row — reproduces the existing tab markup + behavior verbatim. */
function RankingRow({ entity: e, rank }: NumberedRow) {
  return (
    <TableRow
      className={cn(
        e.isTarget && "bg-primary/[0.07] font-bold hover:bg-primary/[0.07]",
      )}
    >
      <TableCell
        className={cn(
          "text-right tabular-nums text-muted-foreground",
          e.isTarget && "border-l-2 border-primary font-bold text-foreground",
        )}
      >
        {rank}
      </TableCell>
      <TableCell className={cn(e.isTarget ? "font-bold" : "font-medium")}>
        <span className="flex items-center gap-2">{e.name}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {e.valuation != null ? formatCurrency(e.valuation) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {e.revenue != null ? formatCurrency(e.revenue) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMultiple(e.multiple)}
      </TableCell>
      <TableCell className={cn(!e.isTarget && "text-muted-foreground")}>
        {formatDate(e.valuationDate)}
      </TableCell>
      <TableCell className={cn("text-xs", !e.isTarget && "text-muted-foreground")}>
        {isPublisherDomain(e.source) ? (
          <a
            href={`https://${e.source}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline"
          >
            {e.source}
          </a>
        ) : (
          (e.source ?? "—")
        )}
      </TableCell>
      <TableCell
        className={cn(
          "max-w-xs truncate text-xs",
          !e.isTarget && "text-muted-foreground",
        )}
        title={e.basis ?? undefined}
      >
        {e.basis ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        {e.isTarget ? (
          <span className="text-muted-foreground">—</span>
        ) : e.secVerified ? (
          <span
            className="inline-flex items-center gap-1 text-success"
            title="A matching SEC Form D filing was found"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> SEC
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

/** The plain, ungrouped ranking table (pre-run / no-tiers degrade path). */
function FlatRanking({ ranking }: { ranking: RankedEntity[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <RankingHeader />
        <TableBody>
          {ranking.map((entity, i) => (
            <RankingRow key={`${entity.name}-${i}`} entity={entity} rank={i + 1} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** The tier-grouped ranking: one labelled section + table per non-empty tier. */
function GroupedRanking({
  ranking,
  tiers,
}: {
  ranking: RankedEntity[];
  tiers: Record<string, ThreatTier> | undefined;
}) {
  const groups = groupByTier(ranking, tiers);
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.tier} className="space-y-2">
          <div className="label-eyebrow">{TIER_LABEL[g.tier]}</div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <RankingHeader />
              <TableBody>
                {g.rows.map(({ entity, rank }) => (
                  <RankingRow
                    key={`${entity.name}-${rank}`}
                    entity={entity}
                    rank={rank}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The Capability Matrix grid: one card per row (target + each threat), each
 * showing the four axes as `RatingIndicator`s. The target has no self-scores in
 * the stored block, so its axes render the em-dash "no rating" state.
 */
function CapabilityMatrixGrid({ matrix }: { matrix: CapabilityMatrix }) {
  type MatrixRow = {
    name: string;
    scores: Record<(typeof MATRIX_AXES)[number]["key"], number | null>;
    isTarget: boolean;
  };

  const rows: MatrixRow[] = [
    {
      name: matrix.target,
      isTarget: true,
      scores: {
        ip_depth: null,
        gtm_velocity: null,
        capital_efficiency: null,
        workflow_retention: null,
      },
    },
    ...matrix.threats.map((t) => ({
      name: t.name,
      isTarget: false,
      scores: {
        ip_depth: t.ip_depth,
        gtm_velocity: t.gtm_velocity,
        capital_efficiency: t.capital_efficiency,
        workflow_retention: t.workflow_retention,
      },
    })),
  ];

  return (
    <div className="space-y-2">
      <div className="label-eyebrow">Capability Matrix</div>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.name}
            className={cn(
              "space-y-3 rounded-lg border border-border p-4",
              row.isTarget && "border-primary/40 bg-primary/[0.04]",
            )}
          >
            <div className={cn("text-sm", row.isTarget ? "font-bold" : "font-medium")}>
              {row.name}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {MATRIX_AXES.map((axis) => (
                <RatingIndicator
                  key={axis.key}
                  label={axis.label}
                  value={row.scores[axis.key]}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A short competitive-picture narrative + its Fact/Estimate confidence chip. */
function Narrative({ field }: { field: LabelledField | undefined }) {
  if (!field?.text) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-relaxed">{field.text}</p>
      <ConfidenceChip basis={field.basis} confidence={field.confidence} />
    </div>
  );
}

export function CompetitorsAnalysis({
  ranking,
  competitors,
}: {
  ranking: RankedEntity[];
  competitors: CompetitorsSection | undefined;
}) {
  const hasTiers =
    competitors?.threat_tiers != null &&
    Object.keys(competitors.threat_tiers).length > 0;
  const matrix = competitors?.capability_matrix;
  const hasMatrix = matrix != null && matrix.threats.length > 0;

  return (
    <div className="space-y-6">
      {hasTiers ? (
        <GroupedRanking ranking={ranking} tiers={competitors?.threat_tiers} />
      ) : (
        <FlatRanking ranking={ranking} />
      )}

      {hasMatrix && <CapabilityMatrixGrid matrix={matrix} />}

      <Narrative field={competitors?.narrative} />
    </div>
  );
}
