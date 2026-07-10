"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { generateCompanyReportNow } from "@/app/(app)/reports/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "IC memo" header trigger next to the deep-dive button: generates the
 * per-company research memo PDF from the STORED analysis (no new data fetch,
 * no LLM call) and opens the signed download URL. Disabled with a "run a deep
 * dive first" hint when the company has no stored analysis.
 */
export function GenerateMemoButton({
  companyId,
  hasAnalysis,
}: {
  companyId: string;
  hasAnalysis: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const res = await generateCompanyReportNow(companyId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={run}
        disabled={pending || !hasAnalysis}
        title={
          hasAnalysis
            ? "Generate a research memo PDF from the stored deep-dive analysis"
            : "Run a deep dive first"
        }
      >
        <FileText className={cn("h-3.5 w-3.5", pending && "animate-pulse")} />
        {pending ? "Generating…" : "IC memo"}
      </Button>
    </div>
  );
}
