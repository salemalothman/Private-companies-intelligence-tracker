import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Globe, Sparkles } from "lucide-react";
import {
  getCompany,
  getCompanyAnalysis,
  getCompetitors,
  getDocuments,
  getMarketValuation,
} from "@/lib/queries";
import { isStale } from "@/lib/analysis/staleness";
import { buildCanonicalRecord } from "@/lib/canonical";
import {
  companyChangePct,
  companyInvested,
  currentOwnershipPct,
  currentValue,
  dealFees,
  investmentEntryPoint,
  latestValuation,
  valuationAmount,
} from "@/lib/metrics";
import { buildCompetitorRanking } from "@/lib/competitors/rank";
import { buildCompsTable } from "@/lib/valuation/comps";
import { formatCurrency, formatDate, formatMultiple, formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyTabs } from "@/components/company/company-tabs";
import { CondensedHeader } from "@/components/company/condensed-header";
import { CompanyBento, type CompanyBentoData } from "@/components/company/company-bento";
import { OverviewGroup } from "@/components/company/groups/overview-group";
import { FinancialsGroup } from "@/components/company/groups/financials-group";
import { MarketGroup } from "@/components/company/groups/market-group";
import { RecordsGroup } from "@/components/company/groups/records-group";
import { Stat } from "@/components/company/groups/shared";
import { EditOverviewDialog } from "@/components/company/overview-form";
import { SyncButton } from "@/components/company/sync-button";
import { DeepDiveButton } from "@/components/company/deep-dive-button";
import { DeepDiveEmpty } from "@/components/company/confidence-chip";
import { AddDocumentDialog } from "@/components/company/add-document-dialog";
import { DeleteCompanyButton } from "@/components/company/delete-company-button";
import type {
  AnalysisValuation,
  OverviewSections,
} from "@/lib/agents/deep-dive-types";
import { isContractWin } from "@/lib/news/classify";
import { dedupeFundingRows, dedupeValuationRows } from "@/lib/ingestion/dedupe";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();
  const [competitors, marketRow, documents, analysis] = await Promise.all([
    getCompetitors(id),
    getMarketValuation(company.name),
    getDocuments(id),
    getCompanyAnalysis(id),
  ]);

  // Deep-dive staleness (FND-06): the hint shows when the underlying data the
  // stored analysis was generated from — valuations / competitors — changed
  // strictly after `generated_at`. `isStale` errs toward NOT-stale on missing
  // inputs, so a company with no analysis simply gets the empty state below.
  const latestDataChange = [
    ...company.valuations.map((v) => v.created_at),
    ...competitors.map((c) => c.updated_at ?? c.created_at),
  ]
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const analysisStale = analysis
    ? isStale(analysis.generated_at, latestDataChange)
    : false;

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
  const canonical = buildCanonicalRecord(company, {
    market: marketRow,
    self: selfMetric
      ? {
          source: selfMetric.source,
          valuation: selfMetric.valuation,
          revenue: selfMetric.revenue,
          valuation_date: selfMetric.valuation_date,
        }
      : null,
  });
  const latestVal = latestValuation(company.valuations);
  const competitorRanking = buildCompetitorRanking(
    {
      name: company.name,
      // Authoritative valuation from the valuations table; fall back to the
      // Grok-discovered figure when the company has no recorded valuations.
      valuation: valuationAmount(latestVal) ?? selfMetric?.valuation ?? null,
      valuationDate: latestVal?.date ?? selfMetric?.valuation_date ?? null,
      // Use the reconciled canonical revenue (durable companies.revenue + market
      // + self) so the portfolio company's own V/R multiple is populated.
      revenue: canonical.revenue.value,
    },
    peers,
  );

  // ---- Bento command-center data (no extra queries — all derived above). ----
  const sections = analysis?.sections as OverviewSections | undefined;
  const analysisValuation =
    (analysis?.valuation as AnalysisValuation | null) ?? null;
  // 2030 base case from the SAME pure comps math the Targets tab uses; shown
  // only when the model actually yields a figure (null-honest, never 0).
  const base2030 = analysisValuation
    ? (buildCompsTable(analysisValuation).at(-1)?.base ?? null)
    : null;
  const thesisField = sections?.executive_summary?.thesis;
  const latestNews = sortedNews[0] ?? null;
  const bentoData: CompanyBentoData = {
    position: [
      {
        label: "Invested",
        value: formatCurrency(invested),
        raw: invested != null ? { value: invested, format: "currency" } : undefined,
      },
      {
        label: "Est. current value",
        value: formatCurrency(value),
        accent: "brand",
        raw: value != null ? { value, format: "currency" } : undefined,
      },
      {
        // Static: the +/− sign is semantic and must never flicker mid-count.
        label: "Round change",
        value: change == null ? "—" : formatPercent(change, { signed: true }),
        accent: change == null ? undefined : changeUp ? "success" : "destructive",
      },
      {
        label: "Net MOIC",
        value: formatMultiple(df.netMoic),
        raw:
          df.netMoic != null ? { value: df.netMoic, format: "multiple" } : undefined,
      },
    ],
    valuation: {
      value: formatCurrency(canonical.valuation.value),
      date: formatDate(canonical.valuation.asOf),
      change:
        change == null
          ? null
          : {
              label: "Round change",
              value: formatPercent(change, { signed: true }),
              accent: changeUp ? "success" : "destructive",
            },
    },
    targets: base2030 != null ? { base2030: formatCurrency(base2030) } : null,
    market: {
      topPeers: competitorRanking
        .filter((r) => !r.isTarget)
        .slice(0, 3)
        .map((r) => r.name),
      news: latestNews
        ? {
            title: latestNews.title,
            sentiment: latestNews.sentiment ?? "neutral",
          }
        : null,
      secVerified: peers.filter((p) => p.sec_verified).length,
    },
    thesis: thesisField
      ? { field: thesisField, rating: sections?.ic_conclusion?.rating ?? null }
      : null,
    records: {
      documents: documents.length,
      sources: canonical.sources.length,
    },
  };

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
          <DeepDiveButton companyId={company.id} />
          <EditOverviewDialog company={company} />
          {/* Hairline quarantine: the destructive action must never sit flush
              against a routine one (accidental-click adjacency). */}
          <div aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <DeleteCompanyButton
            companyId={company.id}
            companyName={company.name}
          />
        </div>
      </div>

      {/* Deep-dive analysis status (FND-06): empty-state CTA before the first
          run; a generated_at line + "may be stale" hint once a row exists. */}
      {analysis ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Deep-dive generated {formatDate(analysis.generated_at)}</span>
          {analysisStale && (
            <Badge variant="muted" title="Underlying data changed after this analysis was generated — re-run to refresh.">
              May be stale
            </Badge>
          )}
        </div>
      ) : (
        <DeepDiveEmpty action={<DeepDiveButton companyId={company.id} />} />
      )}

      {/* Key stats */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Invested" value={formatCurrency(invested)} />
          <Stat
            label="Est. current value"
            value={formatCurrency(value)}
            accent="text-brand"
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
            value={ownership == null ? "—" : `${ownership}%`}
          />
          <Stat
            label="Revenue / ARR"
            value={formatCurrency(canonical.revenue.value)}
          />
          <Stat
            label="V / R multiple"
            value={formatMultiple(canonical.multiple)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
          <Stat label="Carry / performance" value={`${df.carryPct}%`} />
          <Stat
            label="Management fee"
            value={`${df.mgmtFeePct}%${df.isCustomMgmt ? " · custom" : ""}`}
          />
          <Stat
            label="Net value (after fees)"
            value={formatCurrency(df.netValue)}
            accent="text-brand"
          />
          <Stat label="Net MOIC" value={formatMultiple(df.netMoic)} />
        </CardContent>
      </Card>

      {/* Condensing header: sentinel sits here in flow — once the stat cards
          scroll off, the fixed compact strip fades in (desktop only). */}
      <CondensedHeader
        name={company.name}
        logoUrl={company.logo_url}
        stats={[
          { label: "Invested", value: formatCurrency(invested) },
          {
            label: "Value",
            value: formatCurrency(value),
            accent: "brand",
          },
          {
            label: "Change",
            value: change == null ? "—" : formatPercent(change, { signed: true }),
            accent: change == null ? undefined : changeUp ? "success" : "destructive",
          },
          { label: "Net MOIC", value: formatMultiple(df.netMoic) },
        ]}
      />

      {/* Tabs — 4 intent groups (was 9 flat tabs); every legacy ?tab= value
          still deep-links via the alias resolver in CompanyTabs. */}
      <CompanyTabs>
        {/* max-w-full + overflow-x-auto keeps the strip usable on the narrowest
            phones; scroll-fade-r hints when anything is clipped. */}
        <TabsList className="scroll-fade-r max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="market">Market</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewGroup
            company={company}
            analysis={analysis}
            bento={<CompanyBento data={bentoData} />}
          />
        </TabsContent>

        <TabsContent value="financials">
          <FinancialsGroup
            company={company}
            analysis={analysis}
            investments={sortedInvestments}
            valuations={valuations}
            sortedVals={sortedVals}
            sortedRounds={sortedRounds}
            market={marketRow}
            investmentEntry={investmentEntryPoint(company)}
          />
        </TabsContent>

        <TabsContent value="market">
          <MarketGroup
            company={company}
            analysis={analysis}
            peers={peers}
            ranking={competitorRanking}
            sortedNews={sortedNews}
          />
        </TabsContent>

        <TabsContent value="records">
          <RecordsGroup canonical={canonical} documents={documents} />
        </TabsContent>
      </CompanyTabs>
    </div>
  );
}
