import { Handshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AddNewsDialog } from "@/components/company/entity-dialogs";
import { CompetitorsAnalysis } from "@/components/company/competitors-analysis";
import { DeepDiveButton } from "@/components/company/deep-dive-button";
import { DeepDiveEmpty } from "@/components/company/confidence-chip";
import { RefreshCompetitorsButton } from "@/components/company/refresh-competitors-button";
import { SectionRail } from "@/components/company/section-rail";
import {
  EmptyRow,
  GroupSection,
  sentimentVariant,
} from "@/components/company/groups/shared";
import { isContractWin } from "@/lib/news/classify";
import { cn, formatDate } from "@/lib/utils";
import type { RankedEntity } from "@/lib/competitors/rank";
import type {
  CompanyAnalysisRow,
  CompanyWithRelations,
  CompetitorRow,
} from "@/lib/types";
import type { OverviewSections } from "@/lib/agents/deep-dive-types";

/**
 * Market group: competitive landscape + news. Content moved verbatim from the
 * former flat Competitors and News tabs.
 */
export function MarketGroup({
  company,
  analysis,
  peers,
  ranking,
  sortedNews,
}: {
  company: CompanyWithRelations;
  analysis: CompanyAnalysisRow | null;
  peers: CompetitorRow[];
  ranking: RankedEntity[];
  sortedNews: CompanyWithRelations["news"];
}) {
  return (
    <div className="flex gap-8">
      <div className="min-w-0 flex-1 space-y-8">
        <GroupSection id="competitors" eyebrow="Competitive landscape">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {company.name} ranked against its primary competitors by latest
                valuation, with revenue/ARR and the implied valuation-to-revenue
                multiple. Each figure is tagged with its primary source
                (financial press, SEC filings, or verified X accounts).
              </p>
              <RefreshCompetitorsButton
                companyId={company.id}
                hasData={peers.length > 0}
              />
            </div>
            {peers.length === 0 ? (
              <EmptyRow text="No competitors discovered yet. Click “Sync data” (or “Find competitors”) to scan X and SEC filings." />
            ) : (
              <div className="space-y-4">
                {/* Before the first deep-dive run the enrichment shows the CTA
                    while the flat ranking still renders below (mirrors the
                    Overview tab gate). */}
                {!analysis && (
                  <DeepDiveEmpty
                    action={<DeepDiveButton companyId={company.id} />}
                  />
                )}
                <CompetitorsAnalysis
                  ranking={ranking}
                  competitors={
                    (analysis?.sections as OverviewSections | undefined)
                      ?.competitors
                  }
                />
              </div>
            )}
          </div>
        </GroupSection>

        <GroupSection id="news" eyebrow="News & updates">
          <div className="space-y-4">
            <div className="flex items-center justify-end">
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
                        // Sentiment as a quiet 2px left hairline — color-only,
                        // no motion, neutral stays unmarked.
                        n.sentiment === "positive" &&
                          "border-l-2 border-l-success",
                        n.sentiment === "negative" &&
                          "border-l-2 border-l-destructive",
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
        </GroupSection>
      </div>

      <SectionRail
        sections={[
          { id: "competitors", label: "Competitors" },
          { id: "news", label: "News" },
        ]}
      />
    </div>
  );
}
