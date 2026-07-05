import { getCompaniesWithRelations } from "@/lib/queries";
import { companyInvested, dealAnalytics, fundAnalytics } from "@/lib/metrics";
import { PageHeader } from "@/components/app/page-header";
import { FundTable } from "@/components/fund/fund-table";

export default async function FundPage() {
  const companies = await getCompaniesWithRelations();

  const now = new Date();
  const totalInvested = companies.reduce((s, c) => s + companyInvested(c), 0);
  // Fees are defined per asset; deals without an override fall back to the
  // standard default (lib/metrics DEFAULT_FUND_FEES) — no global fund setting.
  const deals = companies.map((c) => dealAnalytics(c, totalInvested, undefined, now));
  const fund = fundAnalytics(companies, undefined, now);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Fund Analysis"
        titleEffect
        subtitle="Deal-by-deal performance — MOIC, IRR, holding period, and ownership. Fees are set per company."
      />

      <FundTable deals={deals} fund={fund} />
    </div>
  );
}
