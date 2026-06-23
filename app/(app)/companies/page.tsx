import { getCompaniesWithRelations } from "@/lib/queries";
import { companyTableRow } from "@/lib/metrics";
import { PageHeader } from "@/components/app/page-header";
import { AddCompanyDialog } from "@/components/company/add-company-dialog";
import { CompanyTable } from "@/components/dashboard/company-table";

export default async function CompaniesPage() {
  const companies = await getCompaniesWithRelations();
  const rows = companies.map(companyTableRow);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Companies"
        subtitle={`${companies.length} private ${
          companies.length === 1 ? "company" : "companies"
        } in your portfolio`}
        actions={<AddCompanyDialog />}
      />
      <CompanyTable rows={rows} />
    </div>
  );
}
