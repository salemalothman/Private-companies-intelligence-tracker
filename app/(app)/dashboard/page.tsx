import { getCompaniesWithRelations } from "@/lib/queries";
import {
  companyTableRow,
  latestValuationChanges,
  lastFundingRound,
  portfolioSummary,
  portfolioValueSeries,
  riskMatrix,
  sectorAllocation,
  topPerformers,
} from "@/lib/metrics";
import { PageHeader } from "@/components/app/page-header";
import { AddCompanyDialog } from "@/components/company/add-company-dialog";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { PortfolioCharts } from "@/components/dashboard/portfolio-charts";
import { CompanyTable } from "@/components/dashboard/company-table";

export default async function DashboardPage() {
  const companies = await getCompaniesWithRelations();

  const summary = portfolioSummary(companies);
  const changes = latestValuationChanges(companies);
  const rows = companies.map(companyTableRow);

  // "Upcoming events" — surface the most recent funding rounds as activity.
  const events = companies
    .map((c) => {
      const round = lastFundingRound(c);
      return round
        ? { id: c.id, name: c.name, label: round.round, date: round.date }
        : null;
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 5);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Portfolio Dashboard"
        subtitle="What is your private portfolio worth today — and what changed?"
        actions={<AddCompanyDialog />}
      />

      <SummaryCards summary={summary} changes={changes} events={events} />

      <PortfolioCharts
        valueSeries={portfolioValueSeries(companies)}
        allocation={sectorAllocation(companies)}
        performers={topPerformers(companies)}
        risk={riskMatrix(companies)}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Portfolio companies</h2>
        <CompanyTable rows={rows} />
      </section>
    </div>
  );
}
