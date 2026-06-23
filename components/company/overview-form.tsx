"use client";

import { Pencil } from "lucide-react";
import { updateCompanyOverview } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormDialog } from "@/components/company/form-dialog";
import type { Company } from "@/lib/types";

export function EditOverviewDialog({
  company,
  defaults,
}: {
  company: Company;
  defaults: { carry_pct: number; mgmt_fee_pct: number };
}) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="ghost" className="gap-2">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      }
      title="Edit company overview"
      action={updateCompanyOverview.bind(null, company.id)}
      submitLabel="Save changes"
    >
      <Field label="Company name *">
        <Input name="name" required defaultValue={company.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sector">
          <Input name="sector" defaultValue={company.sector ?? ""} />
        </Field>
        <Field label="Country">
          <Input name="country" defaultValue={company.country ?? ""} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Website">
          <Input name="website" defaultValue={company.website ?? ""} />
        </Field>
        <Field label="Founded year">
          <Input
            name="founded_year"
            type="number"
            defaultValue={company.founded_year ?? ""}
          />
        </Field>
      </div>
      <Field label="Logo URL">
        <Input name="logo_url" defaultValue={company.logo_url ?? ""} />
      </Field>
      <Field label="Founders (comma-separated)">
        <Input
          name="founders"
          defaultValue={(company.founders ?? []).join(", ")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <select
            name="status"
            defaultValue={company.status}
            className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 text-base sm:h-9 sm:text-sm"
          >
            <option value="active">Active</option>
            <option value="exited">Exited</option>
          </select>
        </Field>
        <Field label="Realized proceeds ($)">
          <Input
            name="realized_proceeds"
            type="number"
            step="any"
            defaultValue={company.realized_proceeds ?? 0}
          />
        </Field>
      </div>

      <div className="rounded-lg border border-border p-3">
        <p className="label-eyebrow mb-2">Deal-specific fees</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Leave blank to inherit the fund default. Overrides apply only to this
          asset.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Carry / performance %">
            <Input
              name="carry_pct"
              type="number"
              step="any"
              defaultValue={company.carry_pct ?? ""}
              placeholder={`Default ${defaults.carry_pct}%`}
            />
          </Field>
          <Field label="Management fee %">
            <Input
              name="mgmt_fee_pct"
              type="number"
              step="any"
              defaultValue={company.mgmt_fee_pct ?? ""}
              placeholder={`Default ${defaults.mgmt_fee_pct}%`}
            />
          </Field>
        </div>
      </div>
      <Field label="Description">
        <Textarea name="description" defaultValue={company.description ?? ""} />
      </Field>
    </FormDialog>
  );
}
