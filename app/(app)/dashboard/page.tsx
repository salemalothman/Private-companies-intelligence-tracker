import {
  getAlertPrefs,
  getCompaniesWithRelations,
  getCompanyEvents,
  getRecentEvents,
  getUnseenEventCount,
} from "@/lib/queries";
import {
  investedCapitalSeries,
  latestValuationChanges,
  portfolioSummary,
  portfolioValueSeries,
  sectorAllocation,
  topPerformers,
} from "@/lib/metrics";
import { partitionEvents } from "@/lib/calendar";
import { PageHeader } from "@/components/app/page-header";
import { AddCompanyDialog } from "@/components/company/add-company-dialog";
import {
  SummaryCards,
  ValuationChangesList,
} from "@/components/dashboard/summary-cards";
import { PortfolioCharts } from "@/components/dashboard/portfolio-charts";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { EventsCalendar } from "@/components/dashboard/events-calendar";
import { GlobalSyncButton } from "@/components/dashboard/global-sync-button";
import { Reveal } from "@/components/motion/reveal";

export default async function DashboardPage() {
  const [companies, activity, unseen, alertPrefs, calendar] = await Promise.all([
    getCompaniesWithRelations(),
    getRecentEvents(),
    getUnseenEventCount(),
    getAlertPrefs(),
    getCompanyEvents(),
  ]);

  const summary = portfolioSummary(companies);
  const changes = latestValuationChanges(companies);

  // Strict chronological split: only true future-dated events are "upcoming";
  // historical and undated records route to the timeline view.
  const today = new Date().toISOString().slice(0, 10);
  const { upcoming, past } = partitionEvents(calendar, today);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Portfolio Dashboard"
        subtitle="What is your private portfolio worth today — and what changed?"
        titleEffect
        actions={
          <div className="flex items-start gap-2">
            <GlobalSyncButton />
            <AddCompanyDialog />
          </div>
        }
      />

      {/* Above the fold — the route template already animates it; no Reveal. */}
      <SummaryCards summary={summary} />

      {/* Reference sequencing: stats → charts → changes → events → activity. */}
      <PortfolioCharts
        valueSeries={portfolioValueSeries(companies)}
        investedSeries={investedCapitalSeries(companies)}
        allocation={sectorAllocation(companies)}
        performers={topPerformers(companies)}
      />

      {/* Below-fold sections rise in once as they scroll into view. */}
      <Reveal>
        <ValuationChangesList changes={changes} />
      </Reveal>

      <Reveal delay={0.05}>
        <EventsCalendar upcoming={upcoming} past={past} />
      </Reveal>

      <Reveal delay={0.1}>
        <ActivityFeed events={activity} unseen={unseen} prefs={alertPrefs} />
      </Reveal>
    </div>
  );
}
