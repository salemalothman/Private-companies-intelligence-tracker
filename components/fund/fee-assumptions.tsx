"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { updateFundSettings } from "@/app/(app)/fund/actions";
import type { ActionResult } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  cn,
  formatCurrency,
  formatMillionsSigned,
  formatMultiple,
} from "@/lib/utils";
import type { FundAnalytics } from "@/lib/metrics";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function FeeAssumptions({
  carryPct,
  mgmtFeePct,
  fund,
}: {
  carryPct: number;
  mgmtFeePct: number;
  fund: FundAnalytics;
}) {
  const router = useRouter();
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    updateFundSettings,
    undefined,
  );

  useEffect(() => {
    if (state && !state.error) router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-medium">Fee assumptions</h3>
          <form action={action} className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-muted-foreground">
                Performance fee / carry %
              </label>
              <div className="flex items-center gap-1">
                <Input
                  name="carry_pct"
                  type="number"
                  step="any"
                  defaultValue={carryPct}
                  className="h-8 w-20 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-muted-foreground">
                Management fee % (annual, on invested)
              </label>
              <div className="flex items-center gap-1">
                <Input
                  name="mgmt_fee_pct"
                  type="number"
                  step="any"
                  defaultValue={mgmtFeePct}
                  className="h-8 w-20 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <div className="flex justify-end">
              <SaveButton />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-medium">Net to LPs (after fees)</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label={`Carry (${carryPct}% of profit)`}>
              {formatCurrency(fund.carry, { compact: false })}
            </Row>
            <Row label="Management fees (accrued)">
              {formatCurrency(fund.mgmtFees, { compact: false })}
            </Row>
            <Row label="Net value">
              {formatCurrency(fund.netValue, { compact: false })}
            </Row>
            <Row label="Net gain / (loss)">
              <span className={cn(fund.netGainLoss < 0 && "text-destructive")}>
                {formatMillionsSigned(fund.netGainLoss)}
              </span>
            </Row>
            <Row label="Net MOIC">
              <span className="font-semibold">
                {formatMultiple(fund.netMoic)}
              </span>
            </Row>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}
