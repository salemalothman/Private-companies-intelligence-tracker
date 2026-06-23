import { getCompaniesWithRelations, getFundSettings } from "@/lib/queries";
import { companyInvested, dealAnalytics, fundAnalytics } from "@/lib/metrics";
import { PageHeader } from "@/components/app/page-header";
import { FundTable } from "@/components/fund/fund-table";
import { FeeAssumptions } from "@/components/fund/fee-assumptions";

export default async function FundPage() {
  const [companies, fees] = await Promise.all([
    getCompaniesWithRelations(),
    getFundSettings(),
  ]);

  const now = new Date();
  const totalInvested = companies.reduce((s, c) => s + companyInvested(c), 0);
  const deals = companies.map((c) => dealAnalytics(c, totalInvested, now));
  const fund = fundAnalytics(
    companies,
    { carryPct: fees.carry_pct, mgmtFeePct: fees.mgmt_fee_pct },
    now,
  );

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Fund Analysis"
        subtitle="Deal-by-deal performance — MOIC, IRR, holding period, and ownership."
      />

      <FundTable deals={deals} fund={fund} />

      <FeeAssumptions
        carryPct={fees.carry_pct}
        mgmtFeePct={fees.mgmt_fee_pct}
        fund={fund}
      />
    </div>
  );
}
