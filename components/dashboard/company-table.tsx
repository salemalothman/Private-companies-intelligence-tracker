"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChevronsUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EditOverviewDialog } from "@/components/company/overview-form";
import { cn, formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { DEFAULT_FUND_FEES, type CompanyTableRow } from "@/lib/metrics";
import type { Company } from "@/lib/types";

type SortKey =
  | "name"
  | "sector"
  | "amountInvested"
  | "lastValuation"
  | "changePct";

export function CompanyTable({
  rows,
  companies = [],
}: {
  rows: CompanyTableRow[];
  /** Full company records, so each row gets an inline Edit dialog. */
  companies?: Company[];
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("amountInvested");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const byId = useMemo(
    () => new Map(companies.map((c) => [c.id, c])),
    [companies],
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return dir === "asc"
        ? Number(av) - Number(bv)
        : Number(bv) - Number(av);
    });
    return copy;
  }, [rows, sort, dir]);

  function toggle(key: SortKey) {
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDir("desc");
    }
  }

  const SortHead = ({
    label,
    k,
    className,
  }: {
    label: string;
    k: SortKey;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        onClick={() => toggle(k)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <ChevronsUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No companies yet. Add your first private company to start tracking.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="Company" k="name" />
            <SortHead label="Sector" k="sector" />
            <TableHead>Country</TableHead>
            <TableHead>Invested</TableHead>
            <SortHead label="Amount" k="amountInvested" className="text-right" />
            <TableHead className="text-right">Own %</TableHead>
            <SortHead label="Last Val." k="lastValuation" className="text-right" />
            <TableHead className="text-right">Prev Val.</TableHead>
            <SortHead label="Change" k="changePct" className="text-right" />
            <TableHead>Round</TableHead>
            <TableHead>Last Update</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10 text-right">
              <span className="sr-only">Edit</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => {
            const up = (r.changePct ?? 0) >= 0;
            return (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => router.push(`/companies/${r.id}`)}
              >
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>
                  {r.sector ? (
                    <Badge variant="secondary">{r.sector}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.country ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(r.investmentDate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(r.amountInvested)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.ownershipPct != null ? `${r.ownershipPct}%` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(r.lastValuation)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatCurrency(r.previousValuation)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.changePct == null ? (
                    "—"
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5",
                        up ? "text-success" : "text-destructive",
                      )}
                    >
                      {up ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      )}
                      {formatPercent(r.changePct, { signed: true })}
                    </span>
                  )}
                </TableCell>
                <TableCell>{r.lastFundingRound ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(r.lastUpdate)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={r.status === "active" ? "outline" : "muted"}
                  >
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {byId.has(r.id) && (
                    // Stop row-navigation when interacting with the edit dialog.
                    <span onClick={(e) => e.stopPropagation()}>
                      <EditOverviewDialog
                        company={byId.get(r.id)!}
                        defaults={{
                          carry_pct: DEFAULT_FUND_FEES.carryPct,
                          mgmt_fee_pct: DEFAULT_FUND_FEES.mgmtFeePct,
                        }}
                        iconOnly
                      />
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
