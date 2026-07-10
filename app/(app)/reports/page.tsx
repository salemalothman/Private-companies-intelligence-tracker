import { PageHeader } from "@/components/app/page-header";
import {
  getDigestPrefs,
  listCompaniesWithAnalysis,
  listReports,
} from "@/lib/queries";
import { ReportsView } from "@/components/reports/reports-view";

export default async function ReportsPage() {
  const [reports, prefs, companies] = await Promise.all([
    listReports(),
    getDigestPrefs(),
    listCompaniesWithAnalysis(),
  ]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Reports"
        titleEffect
        subtitle="Download your portfolio digests and company memos, and configure how they're generated."
      />
      <ReportsView reports={reports} prefs={prefs} companies={companies} />
    </div>
  );
}
