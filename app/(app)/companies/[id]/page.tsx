import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  Globe,
} from "lucide-react";
import { getCompany, getFundSettings } from "@/lib/queries";
import {
  companyChangePct,
  companyInvested,
  currentOwnershipPct,
  currentValue,
  dealFees,
  riskScore,
  valuationAmount,
} from "@/lib/metrics";
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
import { ValuationTimeline } from "@/components/company/valuation-timeline";
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
  const [company, fees] = await Promise.all([getCompany(id), getFundSettings()]);
  if (!company) notFound();

  const invested = companyInvested(company);
  const value = currentValue(company);
  const change = companyChangePct(company);
  const ownership = currentOwnershipPct(company);
  const risk = riskScore(company);
  const changeUp = (change ?? 0) >= 0;
  const feeDefaults = { carryPct: fees.carry_pct, mgmtFeePct: fees.mgmt_fee_pct };
  const df = dealFees(company, feeDefaults);

  const sortedVals = [...company.valuations].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const sortedRounds = [...company.funding_rounds].sort((a, b) => {
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
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });

  return (
    <div className="space-y-6 p-6 lg:p-8">
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
        <div className="flex items-center gap-2">
          <SyncButton companyId={company.id} />
          <EditOverviewDialog
            company={company}
            defaults={{ carry_pct: fees.carry_pct, mgmt_fee_pct: fees.mgmt_fee_pct }}
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
          <Stat label="Risk score" value={risk != null ? String(risk) : "—"} />
        </CardContent>
      </Card>

      {/* Deal-specific fee structure */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat
            label="Carry / performance"
            value={`${df.carryPct}%${df.isCustomCarry ? " · custom" : " · default"}`}
          />
          <Stat
            label="Management fee"
            value={`${df.mgmtFeePct}%${df.isCustomMgmt ? " · custom" : " · default"}`}
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
                <ValuationTimeline valuations={company.valuations} />
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
                {sortedNews.map((n) => (
                  <Card key={n.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
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
                ))}
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
