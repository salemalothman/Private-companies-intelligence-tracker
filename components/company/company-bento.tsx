import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfidenceChip } from "@/components/company/confidence-chip";
import { TabLink } from "@/components/company/tab-link";
import {
  AnimatedNumber,
  type AnimatedNumberFormat,
} from "@/components/motion/animated-number";
import { PressCard } from "@/components/motion/press-card";
import { cn } from "@/lib/utils";
import type { IcRating, LabelledField } from "@/lib/agents/deep-dive-types";

/**
 * Bento command-center: the Overview landing grid. Six modular summary cards
 * that answer the page's core questions at a glance and deep-link (via
 * TabLink's shallow URL writes — never router navigations) into the group +
 * section that holds the detail. All figures are SERVER-formatted strings
 * computed in page.tsx from data the page already loads — the bento adds zero
 * queries. Generated fields keep their ConfidenceChips: the honesty layer
 * travels with the data.
 */

export interface BentoStat {
  label: string;
  value: string;
  accent?: "brand" | "success" | "destructive";
  /** Present → the figure counts up on first view (AnimatedNumber). */
  raw?: { value: number; format: AnimatedNumberFormat };
}

export interface CompanyBentoData {
  position: BentoStat[];
  valuation: { value: string; date: string; change: BentoStat | null };
  targets: { base2030: string } | null;
  market: {
    topPeers: string[];
    news: { title: string; sentiment: "positive" | "negative" | "neutral" } | null;
    secVerified: number;
  };
  thesis: { field: LabelledField; rating: IcRating | null } | null;
  records: { documents: number; sources: number };
}

const RATING_LABEL: Record<IcRating, string> = {
  strong_buy: "Strong buy",
  buy: "Buy",
  hold: "Hold",
  sell: "Sell",
};

function accentClass(accent?: BentoStat["accent"]): string | undefined {
  if (accent === "brand") return "text-brand";
  if (accent === "success") return "text-success";
  if (accent === "destructive") return "text-destructive";
  return undefined;
}

function BentoCard({
  eyebrow,
  link,
  children,
  className,
}: {
  eyebrow: string;
  link: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // PressCard carries the grid-placement className so col-spans apply to the
    // hover-lifting wrapper, keeping the Card itself full-height inside.
    <PressCard className={className}>
      <Card className="flex h-full flex-col">
        <CardContent className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="label-eyebrow">{eyebrow}</span>
            {link}
          </div>
          {children}
        </CardContent>
      </Card>
    </PressCard>
  );
}

export function CompanyBento({ data }: { data: CompanyBentoData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <BentoCard
        eyebrow="Position"
        link={<TabLink tab="financials">Financials</TabLink>}
      >
        <div className="grid grid-cols-2 gap-3">
          {data.position.map((s) => (
            <div key={s.label}>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div
                className={cn(
                  "mt-0.5 text-lg font-semibold tabular-nums",
                  accentClass(s.accent),
                )}
              >
                {s.raw ? (
                  <AnimatedNumber value={s.raw.value} format={s.raw.format} />
                ) : (
                  s.value
                )}
              </div>
            </div>
          ))}
        </div>
      </BentoCard>

      <BentoCard
        eyebrow="Valuation"
        link={
          <TabLink tab="financials" section="valuation">
            Timeline
          </TabLink>
        }
      >
        <div>
          <div className="text-2xl font-semibold tabular-nums">
            {data.valuation.value}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>as of {data.valuation.date}</span>
            {data.valuation.change && (
              <span
                className={cn(
                  "font-medium tabular-nums",
                  accentClass(data.valuation.change.accent),
                )}
              >
                {data.valuation.change.value}
              </span>
            )}
          </div>
        </div>
      </BentoCard>

      <BentoCard
        eyebrow="Valuation targets"
        link={
          <TabLink tab="financials" section="targets">
            Comps model
          </TabLink>
        }
      >
        {data.targets ? (
          <div>
            <div className="text-2xl font-semibold tabular-nums text-brand">
              {data.targets.base2030}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              2030 base case — implied by peer comps, not a forecast.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run a deep dive to model 2026–2030 targets from peer multiples.
          </p>
        )}
      </BentoCard>

      <BentoCard
        eyebrow="Market"
        link={<TabLink tab="market">Landscape</TabLink>}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {data.market.topPeers.length > 0 ? (
              data.market.topPeers.map((p) => (
                <Badge key={p} variant="secondary">
                  {p}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                No competitors discovered yet.
              </span>
            )}
            {data.market.secVerified > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs text-success"
                title="Peers with a matching SEC Form D filing"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {data.market.secVerified} SEC
              </span>
            )}
          </div>
          {data.market.news && (
            // div, not <p>: Badge renders a <div>, which is invalid inside <p>
            // (hydration error).
            <div className="line-clamp-2 text-xs text-muted-foreground">
              <Badge
                variant={
                  data.market.news.sentiment === "positive"
                    ? "success"
                    : data.market.news.sentiment === "negative"
                      ? "destructive"
                      : "muted"
                }
                className="mr-1.5 align-middle"
              >
                {data.market.news.sentiment}
              </Badge>
              {data.market.news.title}
            </div>
          )}
        </div>
      </BentoCard>

      <BentoCard
        eyebrow="Thesis"
        className="md:col-span-2"
        link={
          <TabLink tab="overview" section="thesis">
            Full analysis
          </TabLink>
        }
      >
        {data.thesis ? (
          <div className="space-y-2">
            <p className="line-clamp-3 text-sm leading-relaxed">
              {data.thesis.field.text}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceChip
                basis={data.thesis.field.basis}
                confidence={data.thesis.field.confidence}
              />
              {data.thesis.rating && (
                <Badge variant="outline">{RATING_LABEL[data.thesis.rating]}</Badge>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run a deep dive to generate the investment thesis.
          </p>
        )}
      </BentoCard>

      <BentoCard
        eyebrow="Records"
        link={<TabLink tab="records">Provenance</TabLink>}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Documents</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {data.records.documents}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Sources</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {data.records.sources}
            </div>
          </div>
        </div>
      </BentoCard>
    </div>
  );
}
