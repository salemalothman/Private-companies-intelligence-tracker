import Link from "next/link";
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
import {
  cn,
  formatCurrency,
  formatDate,
  formatMillionsSigned,
  formatMultiple,
  formatPercent,
  formatTinyPercent,
} from "@/lib/utils";
import { DEFAULT_FUND_FEES, type DealAnalytics, type FundAnalytics } from "@/lib/metrics";
import type { Company } from "@/lib/types";

const full = (v: number | null | undefined) =>
  formatCurrency(v, { compact: false });

const holding = (y: number | null) => (y == null ? "—" : `${y.toFixed(1)}y`);

function gainClass(v: number) {
  return v < 0 ? "text-destructive" : v > 0 ? "text-success" : "";
}

export function FundTable({
  deals,
  fund,
  companies = [],
}: {
  deals: DealAnalytics[];
  fund: FundAnalytics;
  /** Full company records, so each deal row gets an inline Edit dialog. */
  companies?: Company[];
}) {
  const byId = new Map(companies.map((c) => [c.id, c]));
  if (deals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No investments yet. Add a company and record an investment to see fund
        analytics.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-card">Deal</TableHead>
            <TableHead>Sector</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Entry Date</TableHead>
            <TableHead className="text-right">Holding</TableHead>
            <TableHead className="text-right">Entry Valuation</TableHead>
            <TableHead className="text-right">Invested</TableHead>
            <TableHead className="text-right">Implied Price</TableHead>
            <TableHead className="text-right">Shares Held</TableHead>
            <TableHead className="text-right">Latest Price</TableHead>
            <TableHead className="text-right">Current Value</TableHead>
            <TableHead className="text-right">Realized</TableHead>
            <TableHead className="text-right">Total Value</TableHead>
            <TableHead className="text-right">Gain / (Loss)</TableHead>
            <TableHead className="text-right">MOIC</TableHead>
            <TableHead className="text-right">Gross IRR</TableHead>
            <TableHead className="text-right">% of Cost</TableHead>
            <TableHead className="text-right">Initial Own %</TableHead>
            <TableHead className="text-right">Carry</TableHead>
            <TableHead className="text-right">Mgmt</TableHead>
            <TableHead className="text-right">Net Value</TableHead>
            <TableHead className="text-right">Net MOIC</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="sticky left-0 bg-card font-medium">
                <span className="flex items-center gap-1">
                  <Link href={`/companies/${d.id}`} className="hover:text-primary">
                    {d.name}
                  </Link>
                  {byId.has(d.id) && (
                    <EditOverviewDialog
                      company={byId.get(d.id)!}
                      defaults={{
                        carry_pct: DEFAULT_FUND_FEES.carryPct,
                        mgmt_fee_pct: DEFAULT_FUND_FEES.mgmtFeePct,
                      }}
                      iconOnly
                    />
                  )}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {d.sector ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={d.status === "active" ? "outline" : "muted"}>
                  {d.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(d.entryDate)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {holding(d.holdingYears)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {full(d.entryValuation)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {full(d.invested)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {full(d.impliedPrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.sharesHeld != null ? d.sharesHeld.toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {full(d.latestPrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {full(d.currentValue)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {full(d.realizedProceeds)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {full(d.totalValue)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums font-medium",
                  gainClass(d.gainLoss),
                )}
              >
                {formatMillionsSigned(d.gainLoss)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMultiple(d.moic)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(d.grossIRR)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(d.pctOfCost)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatTinyPercent(d.initialOwnFraction)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <FeeRate pct={d.fees.carryPct} custom={d.fees.isCustomCarry} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <FeeRate pct={d.fees.mgmtFeePct} custom={d.fees.isCustomMgmt} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {full(d.fees.netValue)}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatMultiple(d.fees.netMoic)}
              </TableCell>
            </TableRow>
          ))}

          {/* TOTAL / FUND */}
          <TableRow className="border-t border-border bg-muted/50 font-semibold hover:bg-muted/50">
            <TableCell className="sticky left-0 bg-muted/50">
              TOTAL / FUND
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell className="text-right tabular-nums">
              {holding(fund.weightedHoldingYears)}
            </TableCell>
            <TableCell />
            <TableCell className="text-right tabular-nums">
              {full(fund.totalInvested)}
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell className="text-right tabular-nums">
              {full(fund.totalCurrentValue)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {full(fund.totalRealized)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {full(fund.totalValue)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right tabular-nums",
                gainClass(fund.gainLoss),
              )}
            >
              {formatMillionsSigned(fund.gainLoss)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMultiple(fund.moic)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(fund.grossIRR)}
            </TableCell>
            <TableCell className="text-right tabular-nums">100.0%</TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell className="text-right tabular-nums">
              {full(fund.netValue)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMultiple(fund.netMoic)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function FeeRate({ pct, custom }: { pct: number; custom: boolean }) {
  return (
    <span className={custom ? "font-medium text-foreground" : "text-muted-foreground"}>
      {pct}%{custom && <span className="ml-0.5 text-primary">•</span>}
    </span>
  );
}
