import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AddFundingRoundDialog,
  AddInvestmentDialog,
  AddValuationDialog,
} from "@/components/company/entity-dialogs";
import { DeepDiveButton } from "@/components/company/deep-dive-button";
import { DeepDiveEmpty } from "@/components/company/confidence-chip";
import { HistoricalFinancials } from "@/components/company/historical-financials";
import { ValuationTargets } from "@/components/company/valuation-targets";
import { ValuationTimeline } from "@/components/company/valuation-timeline";
import { SectionRail } from "@/components/company/section-rail";
import { EmptyRow, GroupSection } from "@/components/company/groups/shared";
import { formatCurrency, formatDate } from "@/lib/utils";
import type {
  CompanyAnalysisRow,
  CompanyWithRelations,
  FundingRoundRow,
  MarketValuationRow,
  ValuationRow,
} from "@/lib/types";
import type {
  AnalysisValuation,
  OverviewSections,
} from "@/lib/agents/deep-dive-types";

/**
 * Financials group: investment history · valuation (financial detail +
 * timeline + rounds table) · valuation targets (comps model) · funding rounds.
 * Content moved verbatim from the four former flat tabs; a sticky rail
 * scroll-spies the sections (legacy ?tab= values land here via ?section=).
 */
export function FinancialsGroup({
  company,
  analysis,
  investments,
  valuations,
  sortedVals,
  sortedRounds,
  market,
  investmentEntry,
}: {
  company: CompanyWithRelations;
  analysis: CompanyAnalysisRow | null;
  investments: CompanyWithRelations["investments"];
  valuations: ValuationRow[];
  sortedVals: ValuationRow[];
  sortedRounds: FundingRoundRow[];
  market: MarketValuationRow | null;
  investmentEntry: { date: string; value: number } | null;
}) {
  return (
    <div className="flex gap-8">
      <div className="min-w-0 flex-1 space-y-8">
        <GroupSection id="investment" eyebrow="Investment history">
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <AddInvestmentDialog companyId={company.id} />
            </div>
            {investments.length === 0 ? (
              <EmptyRow text="No investments recorded yet." />
            ) : (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Round</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Share price</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Own %</TableHead>
                      <TableHead>Investor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {investments.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{formatDate(inv.investment_date)}</TableCell>
                        <TableCell>{inv.round ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(inv.amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inv.share_price != null
                            ? formatCurrency(inv.share_price, { compact: false })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inv.shares != null
                            ? inv.shares.toLocaleString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {inv.ownership_pct != null
                            ? `${inv.ownership_pct}%`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {inv.investor_name ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </GroupSection>

        <GroupSection id="valuation" eyebrow="Valuation">
          <div className="space-y-4">
            {analysis ? (
              <HistoricalFinancials
                financials={
                  (analysis.sections as OverviewSections | undefined)
                    ?.historical_financials
                }
              />
            ) : (
              <DeepDiveEmpty action={<DeepDiveButton companyId={company.id} />} />
            )}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Valuation timeline</h3>
              <AddValuationDialog companyId={company.id} />
            </div>
            <Card>
              <CardContent className="p-5">
                <ValuationTimeline
                  valuations={valuations}
                  investment={investmentEntry}
                  market={
                    market?.valuation != null &&
                    (market.valuation_date ?? market.as_of)
                      ? {
                          date: (market.valuation_date ?? market.as_of)!,
                          value: market.valuation,
                          label: "Market cache",
                        }
                      : null
                  }
                />
              </CardContent>
            </Card>
            {sortedVals.length > 0 && (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Round</TableHead>
                      <TableHead className="text-right">Pre-money</TableHead>
                      <TableHead className="text-right">Post-money</TableHead>
                      <TableHead className="text-right">Share price</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Confidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedVals.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>{formatDate(v.date)}</TableCell>
                        <TableCell>{v.round ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(v.pre_money)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(v.post_money)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {v.share_price != null
                            ? formatCurrency(v.share_price, { compact: false })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {v.source ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted">{v.confidence}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </GroupSection>

        <GroupSection id="targets" eyebrow="Valuation targets">
          <ValuationTargets
            valuation={
              (analysis?.valuation as AnalysisValuation | null) ?? null
            }
            deepDiveAction={<DeepDiveButton companyId={company.id} />}
          />
        </GroupSection>

        <GroupSection id="funding" eyebrow="Funding rounds">
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <AddFundingRoundDialog companyId={company.id} />
            </div>
            {sortedRounds.length === 0 ? (
              <EmptyRow text="No funding rounds recorded yet." />
            ) : (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Round</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Raised</TableHead>
                      <TableHead className="text-right">Valuation</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Investors</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRounds.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.round}</TableCell>
                        <TableCell>{formatDate(r.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(r.amount_raised)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(r.valuation)}
                        </TableCell>
                        <TableCell>{r.lead_investor ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.investors?.join(", ") ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.source ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </GroupSection>
      </div>

      <SectionRail
        sections={[
          { id: "investment", label: "Investment" },
          { id: "valuation", label: "Valuation" },
          { id: "targets", label: "Targets" },
          { id: "funding", label: "Funding" },
        ]}
      />
    </div>
  );
}
