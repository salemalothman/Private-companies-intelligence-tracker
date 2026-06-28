import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  Globe,
  Handshake,
  ShieldCheck,
} from "lucide-react";
import { getCompany, getCompetitors } from "@/lib/queries";
import {
  companyChangePct,
  companyInvested,
  currentOwnershipPct,
  currentValue,
  dealFees,
  DEFAULT_FUND_FEES,
  investmentEntryPoint,
  latestValuation,
  valuationAmount,
} from "@/lib/metrics";
import { buildCompetitorRanking } from "@/lib/competitors/rank";
import {
  cn,
  formatCurrency,
  formatDate,
  formatMultiple,
  formatPercent,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditOverviewDialog } from "@/components/company/overview-form";
import { SyncButton } from "@/components/company/sync-button";
import { AddDocumentDialog } from "@/components/company/add-document-dialog";
import { DeleteCompanyButton } from "@/components/company/delete-company-button";
import { ValuationTimeline } from "@/components/company/valuation-timeline";
import { RefreshCompetitorsButton } from "@/components/company/refresh-competitors-button";
import { BusinessModelAnalysis } from "@/components/company/business-model-analysis";
import { isContractWin } from "@/lib/news/classify";
import { dedupeFundingRows, dedupeValuationRows } from "@/lib/ingestion/dedupe";
import {
  AddFundingRoundDialog,
  AddInvestmentDialog,
  AddNewsDialog,
  AddValuationDialog,
} from "@/components/company/entity-dialogs";
import type { Sentiment } from "@/lib/types";

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", accent)}>
        {value}
      </div>
    </div>
  );
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();
  const competitors = await getCompetitors(id);

  const invested = companyInvested(company);
  const value = currentValue(company);
  const change = companyChangePct(company);
  const ownership = currentOwnershipPct(company);
  const changeUp = (change ?? 0) >= 0;
  const df = dealFees(company);

  // Collapse duplicate rows that describe the same financing event (same
  // post-money within a few days under different round names) before rendering.
  const valuations = dedupeValuationRows(company.valuations);
  const sortedVals = [...valuations].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const sortedRounds = [...dedupeFundingRows(company.funding_rounds)].sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });
  const sortedInvestments = [...company.investments].sort(
    (a, b) =>
      new Date(b.investment_date).getTime() -
      new Date(a.investment_date).getTime(),
  );
  const sortedNews = [...company.news].sort((a, b) => {
    // Surface material contract wins first, then most-recent within each group.
    const da = isContractWin(a.category) ? 1 : 0;
    const db = isContractWin(b.category) ? 1 : 0;
    if (da !== db) return db - da;
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });

  const selfMetric = competitors.find((c) => c.is_self) ?? null;
  const peers = competitors.filter((c) => !c.is_self);
  const latestVal = latestValuation(company.valuations);
  const competitorRanking = buildCompetitorRanking(
    {
      name: company.name,
      // Authoritative valuation from the valuations table; fall back to the
      // Grok-discovered figure when the company has no recorded valuations.
      valuation: valuationAmount(latestVal) ?? selfMetric?.valuation ?? null,
      valuationDate: latestVal?.date ?? selfMetric?.valuation_date ?? null,
      revenue: selfMetric?.revenue ?? null,
    },
    peers,
  );

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {company.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logo_url}
              alt={company.name}
              className="h-14 w-14 rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-card text-xl font-bold text-primary">
              {company.name.charAt(0)}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {company.name}
              </h1>
              <Badge variant={company.status === "active" ? "outline" : "muted"}>
                {company.status}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              {company.sector && <Badge variant="secondary">{company.sector}</Badge>}
              {company.country && <span>{company.country}</span>}
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Website
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddDocumentDialog companyId={company.id} />
          <SyncButton companyId={company.id} />
          <EditOverviewDialog
            company={company}
            defaults={{
              carry_pct: DEFAULT_FUND_FEES.carryPct,
              mgmt_fee_pct: DEFAULT_FUND_FEES.mgmtFeePct,
            }}
          />
          <DeleteCompanyButton
            companyId={company.id}
            companyName={company.name}
          />
        </div>
      </div>

      {/* Key stats */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Invested" value={formatCurrency(invested)} />
          <Stat
            label="Est. current value"
            value={formatCurrency(value)}
            accent="text-primary"
          />
          <Stat
            label="Round change"
            value={change == null ? "—" : formatPercent(change, { signed: true })}
            accent={
              change == null
                ? undefined
                : changeUp
                  ? "text-success"
                  : "text-destructive"
            }
          />
          <Stat
            label="Ownership"
            value={ownership != null ? `${ownership}%` : "—"}
          />
        </CardContent>
      </Card>

      {/* Deal-specific fee structure */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat
            label="Carry / performance"
            value={`${df.carryPct}%${df.isCustomCarry ? " · custom" : ""}`}
          />
          <Stat
            label="Management fee"
            value={`${df.mgmtFeePct}%${df.isCustomMgmt ? " · custom" : ""}`}
          />
          <Stat
            label="Net value (after fees)"
            value={formatCurrency(df.netValue)}
            accent="text-primary"
          />
          <Stat label="Net MOIC" value={formatMultiple(df.netMoic)} />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="investment">Investment</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="funding">Funding Rounds</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
          <TabsTrigger value="news">News</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Stat
                  label="Industry"
                  value={company.sector ?? "—"}
                />
                <Stat
                  label="Founded"
                  value={company.founded_year ? String(company.founded_year) : "—"}
                />
                <Stat label="Country" value={company.country ?? "—"} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Founders</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {company.founders && company.founders.length > 0 ? (
                    company.founders.map((f) => (
                      <Badge key={f} variant="secondary">
                        {f}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Description</div>
                <p className="mt-1 text-sm leading-relaxed">
                  {company.description ?? "No description yet."}
                </p>
              </div>
              <BusinessModelAnalysis company={company} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Investment */}
        <TabsContent value="investment">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Investment history</h3>
              <AddInvestmentDialog companyId={company.id} />
            </div>
            {sortedInvestments.length === 0 ? (
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
                    {sortedInvestments.map((inv) => (
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
        </TabsContent>

        {/* Valuation */}
        <TabsContent value="valuation">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Valuation timeline</h3>
              <AddValuationDialog companyId={company.id} />
            </div>
            <Card>
              <CardContent className="p-5">
                <ValuationTimeline
                  valuations={valuations}
                  investment={investmentEntryPoint(company)}
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
        </TabsContent>

        {/* Funding rounds */}
        <TabsContent value="funding">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Funding rounds</h3>
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
        </TabsContent>

        {/* Competitors */}
        <TabsContent value="competitors">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">Competitive landscape</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {company.name} ranked against its primary competitors by latest
                  valuation, with revenue/ARR and the implied valuation-to-revenue
                  multiple. Sourced via Grok X-search (prioritizing trusted
                  private-market trackers) and cross-checked against SEC filings.
                </p>
              </div>
              <RefreshCompetitorsButton
                companyId={company.id}
                hasData={peers.length > 0}
              />
            </div>
            {peers.length === 0 ? (
              <EmptyRow text="No competitors discovered yet. Click “Sync data” (or “Find competitors”) to scan X and SEC filings." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-right">#</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead className="text-right">Latest valuation</TableHead>
                      <TableHead className="text-right">Revenue / ARR</TableHead>
                      <TableHead className="text-right">V / R multiple</TableHead>
                      <TableHead>As of</TableHead>
                      <TableHead>Basis</TableHead>
                      <TableHead className="text-right">Verified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitorRanking.map((e, i) => (
                      <TableRow
                        key={`${e.name}-${i}`}
                        className={cn(
                          e.isTarget &&
                            "bg-primary/[0.07] font-bold hover:bg-primary/[0.07]",
                        )}
                      >
                        <TableCell
                          className={cn(
                            "text-right tabular-nums text-muted-foreground",
                            e.isTarget &&
                              "border-l-2 border-primary font-bold text-foreground",
                          )}
                        >
                          {i + 1}
                        </TableCell>
                        <TableCell
                          className={cn(e.isTarget ? "font-bold" : "font-medium")}
                        >
                          <span className="flex items-center gap-2">
                            {e.name}
                          </span>
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
                        <TableCell
                          className={cn(!e.isTarget && "text-muted-foreground")}
                        >
                          {formatDate(e.valuationDate)}
                        </TableCell>
                        <TableCell
                          className={cn(!e.isTarget && "text-muted-foreground")}
                        >
                          {e.basis ?? (e.source ? e.source : "—")}
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* News */}
        <TabsContent value="news">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">News &amp; updates</h3>
              <AddNewsDialog companyId={company.id} />
            </div>
            {sortedNews.length === 0 ? (
              <EmptyRow text="No news yet. Add an update — or connect a live news source in a later phase." />
            ) : (
              <div className="space-y-3">
                {sortedNews.map((n) => {
                  const deal = isContractWin(n.category);
                  return (
                  <Card
                    key={n.id}
                    className={cn(
                      deal &&
                        "border-primary/40 bg-primary/[0.03] ring-1 ring-primary/15",
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {deal && (
                              <Badge
                                variant="default"
                                className="gap-1"
                                title="Material business deal / contract win"
                              >
                                <Handshake className="h-3 w-3" /> Contract win
                              </Badge>
                            )}
                            <Badge variant={sentimentVariant(n.sentiment)}>
                              {n.sentiment ?? "neutral"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {n.source ?? "—"} · {formatDate(n.date)}
                            </span>
                          </div>
                          <h4 className="mt-1.5 font-medium leading-snug">
                            {n.url ? (
                              <a
                                href={n.url}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-primary"
                              >
                                {n.title}
                              </a>
                            ) : (
                              n.title
                            )}
                          </h4>
                          {n.summary && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {n.summary}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function sentimentVariant(
  s: Sentiment | null,
): "success" | "destructive" | "muted" {
  if (s === "positive") return "success";
  if (s === "negative") return "destructive";
  return "muted";
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
