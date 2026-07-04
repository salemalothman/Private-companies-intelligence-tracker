import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BusinessModelAnalysis } from "@/components/company/business-model-analysis";
import { OverviewAnalysis } from "@/components/company/overview-sections";
import { DeepDiveEmpty } from "@/components/company/confidence-chip";
import { DeepDiveButton } from "@/components/company/deep-dive-button";
import { SectionRail } from "@/components/company/section-rail";
import { GroupSection, Stat } from "@/components/company/groups/shared";
import type { CompanyWithRelations } from "@/lib/types";
import type { CompanyAnalysisRow } from "@/lib/types";

/**
 * Overview group: bento command-center (passed in — page computes its data),
 * company profile card, and the full deep-dive thesis. Profile/thesis content
 * moved verbatim from the old flat Overview tab.
 */
export function OverviewGroup({
  company,
  analysis,
  bento,
}: {
  company: CompanyWithRelations;
  analysis: CompanyAnalysisRow | null;
  bento: React.ReactNode;
}) {
  return (
    <div className="flex gap-8">
      <div className="min-w-0 flex-1 space-y-6">
        <GroupSection id="summary">{bento}</GroupSection>

        <GroupSection id="profile" eyebrow="Profile">
          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Stat label="Industry" value={company.sector ?? "—"} />
                <Stat
                  label="Founded"
                  value={company.founded_year ? String(company.founded_year) : "—"}
                />
                <Stat label="Country" value={company.country ?? "—"} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Founders</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {company.founders && company.founders.length > 0 ? (
                    company.founders.map((f) => (
                      <Badge key={f} variant="secondary">
                        {f}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Description</div>
                <p className="mt-1 text-sm leading-relaxed">
                  {company.description ?? "No description yet."}
                </p>
              </div>
              <BusinessModelAnalysis company={company} />
            </CardContent>
          </Card>
        </GroupSection>

        {/* Full deep-dive investment thesis (Phase 2): Executive Summary
            pinned top, analytical sections as collapsibles, IC Conclusion
            pinned bottom. Shows the empty-state CTA before the first run. */}
        <GroupSection id="thesis" eyebrow="Investment thesis">
          <div className="space-y-4">
            {analysis ? (
              <OverviewAnalysis sections={analysis.sections} />
            ) : (
              <DeepDiveEmpty action={<DeepDiveButton companyId={company.id} />} />
            )}
          </div>
        </GroupSection>
      </div>

      <SectionRail
        sections={[
          { id: "summary", label: "Summary" },
          { id: "profile", label: "Profile" },
          { id: "thesis", label: "Thesis" },
        ]}
      />
    </div>
  );
}
