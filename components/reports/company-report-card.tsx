"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { generateCompanyReportNow } from "@/app/(app)/reports/actions";
import type { CompanyAnalysisOption, ReportFile } from "@/lib/queries";

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Company memo card: pick a company with a stored deep-dive analysis and
 * generate the branded IC-memo PDF on demand. Companies without an analysis
 * are disabled ("no deep dive yet"); a stale analysis is flagged before and
 * after generation. Generated memos are listed below (kind === "memo").
 */
export function CompanyReportCard({
  companies,
  memos,
}: {
  companies: CompanyAnalysisOption[];
  memos: ReportFile[];
}) {
  const router = useRouter();
  const withAnalysis = companies.filter((c) => c.analysisGeneratedAt != null);
  const [companyId, setCompanyId] = useState(withAnalysis[0]?.id ?? "");
  const [pending, startGen] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = companies.find((c) => c.id === companyId);

  function generate() {
    if (!companyId) return;
    setMsg(null);
    setError(null);
    startGen(async () => {
      const r = await generateCompanyReportNow(companyId);
      if (r.error) {
        setError(r.error);
        return;
      }
      setMsg(
        r.stale
          ? "Memo generated — analysis may be stale; re-run the deep dive for fresh figures."
          : "Memo generated.",
      );
      if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Company memos</CardTitle>
        <p className="text-xs text-muted-foreground">
          Institutional-style research memo rendered from a company&apos;s
          stored deep-dive analysis. No new data is fetched.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Company"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
          >
            {companies.length === 0 && (
              <option value="">No companies yet</option>
            )}
            {companies.map((c) => (
              <option
                key={c.id}
                value={c.id}
                disabled={c.analysisGeneratedAt == null}
              >
                {c.name}
                {c.analysisGeneratedAt == null ? " — no deep dive yet" : ""}
              </option>
            ))}
          </select>
          {/* mono: the shared primary treatment (matches Generate now). */}
          <Button
            size="sm"
            variant="mono"
            onClick={generate}
            disabled={pending || !selected || selected.analysisGeneratedAt == null}
            title={
              selected && selected.analysisGeneratedAt == null
                ? "Run a deep dive first"
                : undefined
            }
          >
            <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
            {pending ? "Generating…" : "Generate memo"}
          </Button>
        </div>

        {selected?.stale && (
          <Badge
            variant="muted"
            title="Underlying data changed after this analysis was generated — re-run the deep dive to refresh."
          >
            Analysis may be stale
          </Badge>
        )}
        {selected && selected.analysisGeneratedAt == null && (
          <p className="text-xs text-muted-foreground">
            Run a deep dive first to enable memo generation.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        {msg && <p className="text-xs text-muted-foreground">{msg}</p>}

        {memos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No memos yet. Pick a company with a deep-dive analysis and generate
            one.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {memos.map((r) => (
              <li
                key={r.name}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium capitalize">
                      {r.label}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {formatDate(r.date)} · {formatSize(r.size)}
                    </span>
                  </span>
                </span>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline">
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
