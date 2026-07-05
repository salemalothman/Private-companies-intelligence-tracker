"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatDate } from "@/lib/utils";
import {
  generateDigestNow,
  updateDigestPrefs,
} from "@/app/(app)/reports/actions";
import type { DigestPrefsView, ReportFile } from "@/lib/queries";

function formatSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
          on ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function ReportsView({
  reports,
  prefs,
}: {
  reports: ReportFile[];
  prefs: DigestPrefsView;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DigestPrefsView>(prefs);
  const [savePending, startSave] = useTransition();
  const [genPending, startGen] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(prefs);

  function save() {
    startSave(() => updateDigestPrefs(draft).then(() => router.refresh()));
  }

  function generate() {
    setMsg(null);
    startGen(async () => {
      const r = await generateDigestNow();
      setMsg(
        "error" in r
          ? r.error
          : `Digest generated${r.emailed ? " and emailed to recipient" : ""}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      {/* Generated reports */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-sm font-medium">Generated digests</CardTitle>
            {msg && <p className="mt-0.5 text-xs text-muted-foreground">{msg}</p>}
          </div>
          {/* mono: the shared white/ink-outline primary treatment (Add
              company, Run deep-dive, Generate now all speak one language). */}
          <Button size="sm" variant="mono" onClick={generate} disabled={genPending}>
            <RefreshCw className={cn("h-3.5 w-3.5", genPending && "animate-spin")} />
            {genPending ? "Generating…" : "Generate now"}
          </Button>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No digests yet. Generate one now, or wait for the scheduled run.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {reports.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">
                        Portfolio digest
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

      {/* Digest configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Digest configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="Scheduled digest" hint="Generate automatically">
            <Toggle
              on={draft.enabled}
              onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
            />
          </Row>

          <Row label="Frequency">
            <select
              value={draft.frequency}
              disabled={!draft.enabled}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  frequency: e.target.value as DigestPrefsView["frequency"],
                }))
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Row>

          <div className="border-t border-border pt-4">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              SECTIONS
            </div>
            <div className="space-y-3">
              <Row label="Holdings table">
                <Toggle
                  on={draft.include_holdings}
                  onClick={() =>
                    setDraft((d) => ({ ...d, include_holdings: !d.include_holdings }))
                  }
                />
              </Row>
              <Row label="Notable activity">
                <Toggle
                  on={draft.include_activity}
                  onClick={() =>
                    setDraft((d) => ({ ...d, include_activity: !d.include_activity }))
                  }
                />
              </Row>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <Label htmlFor="recipient" className="text-sm font-medium">
              Delivery recipient (optional)
            </Label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Email address for digest delivery once email is configured.
            </p>
            <Input
              id="recipient"
              type="email"
              placeholder="lp@fund.com"
              value={draft.recipient_email ?? ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, recipient_email: e.target.value }))
              }
            />
          </div>

          <Button onClick={save} disabled={!dirty || savePending} className="w-full">
            {savePending ? "Saving…" : "Save configuration"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
