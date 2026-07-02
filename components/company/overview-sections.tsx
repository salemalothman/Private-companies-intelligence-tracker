import type {
  AnalysisSections,
  ExecutiveSummarySection,
  IcConclusionSection,
  IcRating,
  LabelledField,
  MarketOpportunitySection,
  OverviewSections,
  StrategicMoatSection,
  TechnologySection,
} from "@/lib/agents/deep-dive-types";
import {
  CollapsibleSection,
  SectionEmpty,
} from "@/components/dashboard/collapsible-section";
import { ConfidenceChip } from "@/components/company/confidence-chip";
import { RatingIndicator } from "@/components/company/rating-indicator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Renders the stored deep-dive `OverviewSections` into the Overview tab: an
 * Executive Summary card pinned at the TOP, every analytical section as an
 * icon-less `CollapsibleSection` in the middle, and an IC Conclusion card pinned
 * at the BOTTOM. Every narrative field carries its `ConfidenceChip`, and the
 * qualitative moat scores render as 1–10 `RatingIndicator`s.
 *
 * This is a Server Component ON PURPOSE — it renders directly inside the RSC
 * page. That is why it OMITS the `icon` prop on `CollapsibleSection` (a lucide
 * `forwardRef` can't cross the server→client boundary) and only uses the
 * server-safe presentational `ConfidenceChip` / `RatingIndicator`. This file
 * must stay a Server Component — do not add the client directive.
 *
 * Honesty guardrails (design spec / Plan 01): all narrative is rendered as JSX
 * text children only — React auto-escapes Grok-originated `sections.*.text` and
 * we never inject raw HTML. Outlook & Exit renders narrative labelled fields
 * ONLY (no forecast odds, no target valuations). Every field is optional, so
 * absent sections degrade to `SectionEmpty` / omission rather than crashing.
 */

/** Human-facing label for the IC rating enum. Pure — exported for unit tests. */
export function icRatingLabel(rating: IcRating): string {
  switch (rating) {
    case "strong_buy":
      return "Strong Buy";
    case "buy":
      return "Buy";
    case "hold":
      return "Hold";
    case "sell":
      return "Sell";
  }
}

/** Badge tint for an IC rating — quiet, per the design system (no neon). */
function icRatingVariant(rating: IcRating): "success" | "muted" | "destructive" {
  if (rating === "strong_buy" || rating === "buy") return "success";
  if (rating === "sell") return "destructive";
  return "muted";
}

/** A single labelled narrative field + its Fact/Estimate + confidence chip. */
function Field({
  label,
  field,
  className,
}: {
  label?: string;
  field: LabelledField | null | undefined;
  className?: string;
}) {
  if (!field || !field.text) return null;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <div className="label-eyebrow">{label}</div>}
      <p className="text-sm leading-relaxed">{field.text}</p>
      <ConfidenceChip basis={field.basis} confidence={field.confidence} />
    </div>
  );
}

/** A muted list of labelled fields (executive-summary strengths/weaknesses). */
function FieldList({
  label,
  items,
}: {
  label: string;
  items: LabelledField[] | null | undefined;
}) {
  const rows = (items ?? []).filter((f) => f && f.text);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="label-eyebrow">{label}</div>
      <ul className="space-y-2">
        {rows.map((f, i) => (
          <li key={i} className="space-y-1">
            <p className="text-sm leading-relaxed">{f.text}</p>
            <ConfidenceChip basis={f.basis} confidence={f.confidence} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Body padding shared by every collapsible section's content. */
const PANEL_BODY = "space-y-4 px-5 py-4";

function ExecutiveSummaryCard({
  section,
}: {
  section: ExecutiveSummarySection | undefined;
}) {
  if (!section) return null;
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h3 className="label-eyebrow">Executive Summary</h3>
      <div className="space-y-4">
        <Field label="Thesis" field={section.thesis} />
        <Field label="Value Proposition" field={section.value_prop} />
        <Field label="Positioning" field={section.positioning} />
        <Field label="Most Likely Outcome" field={section.most_likely_outcome} />
        <FieldList label="Strengths" items={section.strengths} />
        <FieldList label="Weaknesses" items={section.weaknesses} />
      </div>
    </section>
  );
}

function TechnologyPanel({ section }: { section: TechnologySection | undefined }) {
  return (
    <CollapsibleSection title="Core Technology & Differentiator" defaultOpen>
      {section && (section.narrative?.text || section.moat_rating != null) ? (
        <div className={PANEL_BODY}>
          <Field field={section.narrative} />
          <RatingIndicator label="Moat" value={section.moat_rating} />
        </div>
      ) : (
        <SectionEmpty>Run deep-dive to generate this analysis.</SectionEmpty>
      )}
    </CollapsibleSection>
  );
}

function NarrativePanel({
  title,
  field,
}: {
  title: string;
  field: LabelledField | undefined;
}) {
  return (
    <CollapsibleSection title={title}>
      {field?.text ? (
        <div className={PANEL_BODY}>
          <Field field={field} />
        </div>
      ) : (
        <SectionEmpty>Run deep-dive to generate this analysis.</SectionEmpty>
      )}
    </CollapsibleSection>
  );
}

function MarketOpportunityPanel({
  section,
}: {
  section: MarketOpportunitySection | undefined;
}) {
  const has = section && (section.tam?.text || section.sam?.text || section.som?.text);
  return (
    <CollapsibleSection title="Market Opportunity (TAM / SAM / SOM)">
      {has ? (
        <div className={PANEL_BODY}>
          <Field label="TAM" field={section?.tam} />
          <Field label="SAM" field={section?.sam} />
          <Field label="SOM" field={section?.som} />
        </div>
      ) : (
        <SectionEmpty>Run deep-dive to generate this analysis.</SectionEmpty>
      )}
    </CollapsibleSection>
  );
}

function StrategicMoatPanel({
  section,
}: {
  section: StrategicMoatSection | undefined;
}) {
  const has =
    section &&
    (section.switching_costs != null ||
      section.network_flywheel != null ||
      section.distribution_regulatory != null ||
      section.ip != null ||
      section.narrative?.text);
  return (
    <CollapsibleSection title="Strategic Moat">
      {has ? (
        <div className={PANEL_BODY}>
          <div className="grid gap-4 sm:grid-cols-2">
            <RatingIndicator label="Switching Costs" value={section?.switching_costs} />
            <RatingIndicator label="Network / Flywheel" value={section?.network_flywheel} />
            <RatingIndicator
              label="Distribution / Regulatory"
              value={section?.distribution_regulatory}
            />
            <RatingIndicator label="IP" value={section?.ip} />
          </div>
          <Field field={section?.narrative} />
        </div>
      ) : (
        <SectionEmpty>Run deep-dive to generate this analysis.</SectionEmpty>
      )}
    </CollapsibleSection>
  );
}

function IcConclusionCard({
  section,
}: {
  section: IcConclusionSection | undefined;
}) {
  if (!section) return null;
  const hasBody =
    section.rating || section.bull?.text || section.bear?.text || section.recommendation?.text;
  if (!hasBody) return null;
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="label-eyebrow">IC Conclusion</h3>
        {section.rating && (
          <Badge variant={icRatingVariant(section.rating)}>
            {icRatingLabel(section.rating)}
          </Badge>
        )}
      </div>
      <div className="space-y-4">
        <Field label="Bull Case" field={section.bull} />
        <Field label="Bear Case" field={section.bear} />
        <Field label="Recommendation" field={section.recommendation} />
      </div>
    </section>
  );
}

export function OverviewAnalysis({ sections }: { sections: AnalysisSections }) {
  // Narrow the stored (intentionally-wide) alias to the typed OverviewSections
  // shape for rendering; every field is optional so absence degrades gracefully.
  const s = sections as OverviewSections;

  return (
    <div className="space-y-4">
      <ExecutiveSummaryCard section={s.executive_summary} />

      <div className="space-y-3">
        <TechnologyPanel section={s.technology} />
        <NarrativePanel title="Product Portfolio" field={s.product_portfolio} />
        <NarrativePanel title="Vertical & Customer Segments" field={s.vertical_customer} />
        <NarrativePanel title="Business Model" field={s.business_model} />
        <NarrativePanel title="Unit Economics" field={s.unit_economics} />
        <MarketOpportunityPanel section={s.market_opportunity} />
        <StrategicMoatPanel section={s.strategic_moat} />
        <NarrativePanel title="Historical Analogue" field={s.historical_analogue} />
        <NarrativePanel title="Outlook & Exit" field={s.outlook_and_exit} />
      </div>

      <IcConclusionCard section={s.ic_conclusion} />
    </div>
  );
}
