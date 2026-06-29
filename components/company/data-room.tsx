import {
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Link2,
  MinusCircle,
  PlusCircle,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import type { DocumentRowDb } from "@/lib/types";
import type { DiffDirection, DiffItem, DocumentDiff } from "@/lib/documents/diff";

const DIR: Record<DiffDirection, { icon: LucideIcon; cls: string }> = {
  up: { icon: ArrowUpRight, cls: "text-success" },
  down: { icon: ArrowDownRight, cls: "text-destructive" },
  new: { icon: PlusCircle, cls: "text-primary" },
  removed: { icon: MinusCircle, cls: "text-muted-foreground" },
};

function docTitle(d: DocumentRowDb): string {
  if (d.type === "url") return d.file_path.replace(/^https?:\/\//, "");
  const base = d.file_path.split("/").pop() ?? d.file_path;
  return base.replace(/^\d+-/, "").replace(/\.pdf$/i, "");
}

function DiffRow({ item }: { item: DiffItem }) {
  const { icon: Icon, cls } = DIR[item.direction];
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", cls)} />
      <span>
        {item.label}
        {item.detail && (
          <span className="text-muted-foreground"> · {item.detail}</span>
        )}
      </span>
    </li>
  );
}

export function DataRoom({ documents }: { documents: DocumentRowDb[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Data room</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every ingested document, newest first. Each is diffed against the
          previous one for this company — so recurring board decks become a
          tracked change-set.
        </p>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No documents yet. Use “Add document” to ingest a deck or filing.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {documents.map((d) => {
            const diff = (d.diff as DocumentDiff | null)?.changes ?? [];
            return (
              <li key={d.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        {d.type === "url" ? (
                          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate text-sm font-medium">
                          {docTitle(d)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatDate(d.created_at)}
                      </span>
                    </div>

                    {d.diff_vs &&
                      (diff.length > 0 ? (
                        <div className="rounded-md border border-border bg-muted/30 p-3">
                          <div className="label-eyebrow mb-2">
                            Changes vs previous document
                          </div>
                          <ul className="space-y-1.5">
                            {diff.map((item, i) => (
                              <DiffRow key={i} item={item} />
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <Badge variant="muted">No material changes vs previous</Badge>
                      ))}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
