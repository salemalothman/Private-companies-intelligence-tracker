import { DataRoom } from "@/components/company/data-room";
import { Provenance } from "@/components/company/provenance";
import { SectionRail } from "@/components/company/section-rail";
import { GroupSection } from "@/components/company/groups/shared";
import type { CanonicalRecord } from "@/lib/canonical";
import type { DocumentRow } from "@/lib/types";

/**
 * Records group: sources & provenance + the data room. Content moved verbatim
 * from the former flat Provenance and Data room tabs.
 */
export function RecordsGroup({
  canonical,
  documents,
}: {
  canonical: CanonicalRecord;
  documents: DocumentRow[];
}) {
  return (
    <div className="flex gap-8">
      <div className="min-w-0 flex-1 space-y-8">
        <GroupSection id="provenance" eyebrow="Sources & provenance">
          <Provenance record={canonical} />
        </GroupSection>

        <GroupSection id="dataroom" eyebrow="Data room">
          <DataRoom documents={documents} />
        </GroupSection>
      </div>

      <SectionRail
        sections={[
          { id: "provenance", label: "Provenance" },
          { id: "dataroom", label: "Data room" },
        ]}
      />
    </div>
  );
}
