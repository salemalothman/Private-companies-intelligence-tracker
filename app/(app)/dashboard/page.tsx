import {
  getAlertPrefs,
  getCompaniesWithRelations,
  getCompanyEvents,
  getRecentEvents,
  getUnseenEventCount,
} from "@/lib/queries";
import {
  companyTableRow,
  latestValuationChanges,
  portfolioSummary,
  portfolioValueSeries,
  sectorAllocation,
  topPerformers,
} from "@/lib/metrics";
import { partitionEvents } from "@/lib/calendar";
import { PageHeader } from "@/components/app/page-header";
import { AddCompanyDialog } from "@/components/company/add-company-dialog";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { PortfolioCharts } from "@/components/dashboard/portfolio-charts";
import { CompanyTable } from "@/components/dashboard/company-table";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { EventsCalendar } from "@/components/dashboard/events-calendar";
import { GlobalSyncButton } from "@/components/dashboard/global-sync-button";

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
  const rows = companies.map(companyTableRow);

  // Strict chronological split: only true future-dated events are "upcoming";
  // historical and undated records route to the timeline view.
  const today = new Date().toISOString().slice(0, 10);
  const { upcoming, past } = partitionEvents(calendar, today);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Portfolio Dashboard"
        subtitle="What is your private portfolio worth today — and what changed?"
        actions={
          <div className="flex items-start gap-2">
            <GlobalSyncButton />
            <AddCompanyDialog />
          </div>
        }
      />

      <SummaryCards summary={summary} changes={changes} />

      <EventsCalendar upcoming={upcoming} past={past} />

      <ActivityFeed events={activity} unseen={unseen} prefs={alertPrefs} />

      <PortfolioCharts
        valueSeries={portfolioValueSeries(companies)}
        allocation={sectorAllocation(companies)}
        performers={topPerformers(companies)}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Portfolio companies</h2>
        <CompanyTable rows={rows} />
      </section>
    </div>
  );
}
