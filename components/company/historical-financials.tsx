import type {
  HistoricalFinancialsSection,
  LabelledField,
} from "@/lib/agents/deep-dive-types";
import { ConfidenceChip } from "@/components/company/confidence-chip";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The VAL-01 `historical_financials` render block for the Valuation tab.
 *
 * This is a Server Component ON PURPOSE — it renders directly inside the RSC
 * company page and only uses server-safe presentational primitives (`Card`,
 * `ConfidenceChip`) plus plain markup. It must NOT gain the "use client"
 * directive and imports no lucide component as a prop.
 *
 * The stored section carries LabelledFields ONLY (gross_margin / burn_rate /
 * runway / acv) — no fabricated numeric P&L (Plan 02's type-level guardrail).
 * Each present field renders as a compact chip-labelled block: a label eyebrow,
 * the qualitative `text` (React auto-escaped — no dangerouslySetInnerHTML), a
 * Fact/Estimate + confidence chip, and the optional `source` as a muted caption.
 *
 * Honesty / degradation: every field is optional. Absent fields are omitted; if
 * the section is undefined OR every field is absent this returns `null` so the
 * page can show its own empty-state CTA.
 */

/** The four fields, in render order. */
const FIELDS: { key: keyof HistoricalFinancialsSection; label: string }[] = [
  { key: "gross_margin", label: "Gross margin" },
  { key: "burn_rate", label: "Burn rate" },
  { key: "runway", label: "Runway" },
  { key: "acv", label: "ACV" },
];

/** A single labelled financial-detail field: eyebrow + text + chip + source. */
function FinancialField({
  label,
  field,
}: {
  label: string;
  field: LabelledField;
}) {
  return (
    <div className="space-y-1.5">
      <div className="label-eyebrow">{label}</div>
      <p className="text-sm tabular-nums leading-relaxed">{field.text}</p>
      <ConfidenceChip basis={field.basis} confidence={field.confidence} />
      {field.source ? (
        <p className="text-xs text-muted-foreground">{field.source}</p>
      ) : null}
    </div>
  );
}

export function HistoricalFinancials({
  financials,
}: {
  financials: HistoricalFinancialsSection | undefined;
}) {
  const present = FIELDS.map(({ key, label }) => ({
    label,
    field: financials?.[key],
  })).filter(
    (f): f is { label: string; field: LabelledField } =>
      !!f.field && !!f.field.text,
  );

  if (present.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="label-eyebrow">Financial detail</div>
        <div className="grid gap-5 sm:grid-cols-2">
          {present.map(({ label, field }) => (
            <FinancialField key={label} label={label} field={field} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
