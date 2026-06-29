import { ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatMultiple } from "@/lib/utils";
import { provider, type CanonicalField, type CanonicalRecord } from "@/lib/canonical";

const PROVIDER_LABEL: Record<string, string> = {
  grok: "Grok (X)",
  exa: "Exa",
  agdillon: "AG Dillon",
  "sec-edgar": "SEC EDGAR",
  document: "Document",
  web: "Web",
  manual: "Manual",
};

const label = (s: string | null) => PROVIDER_LABEL[provider(s)] ?? provider(s);

function FieldCard({ title, field }: { title: string; field: CanonicalField }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {field.value != null ? formatCurrency(field.value) : "—"}
            </div>
            {field.asOf && (
              <div className="text-xs text-muted-foreground">
                as of {formatDate(field.asOf)}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {field.value == null ? (
              <Badge variant="muted">No data</Badge>
            ) : field.corroboration >= 2 ? (
              <Badge variant="success" className="gap-1">
                <ShieldCheck className="h-3 w-3" /> Confirmed by {field.corroboration} sources
              </Badge>
            ) : (
              <Badge variant="muted">Single source</Badge>
            )}
            {field.conflict && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Sources disagree
              </Badge>
            )}
          </div>
        </div>

        {field.observations.length > 0 && (
          <ul className="space-y-1 border-t border-border pt-2">
            {field.observations
              .filter((o) => o.value != null)
              .map((o, i) => (
                <li
                  key={`${o.source}-${i}`}
                  className="flex items-center justify-between text-sm"
                >
                  <Badge variant="secondary">{label(o.source)}</Badge>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span>{formatCurrency(o.value)}</span>
                    <span className="w-24 text-right text-xs text-muted-foreground">
                      {o.date ? formatDate(o.date) : "—"}
                    </span>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function Provenance({ record }: { record: CanonicalRecord }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Sources &amp; provenance</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every figure reconciled across our sources, with corroboration and
          conflicts surfaced. Confirmed = agreeing within 15%; conflict = a
          source diverges by more than 25%.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldCard title="Valuation" field={record.valuation} />
        <FieldCard title="Revenue / ARR" field={record.revenue} />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-5 py-3">
        <div>
          <div className="text-xs text-muted-foreground">
            Valuation-to-Revenue multiple
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Latest valuation ÷ trailing revenue / ARR
          </div>
        </div>
        <div className="text-2xl font-semibold tabular-nums">
          {record.multiple != null ? formatMultiple(record.multiple) : "—"}
        </div>
      </div>

      {record.sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Sources used:</span>
          {record.sources.map((s) => (
            <Badge key={s} variant="secondary">
              {PROVIDER_LABEL[s] ?? s}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
