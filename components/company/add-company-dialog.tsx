"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createCompany, type ActionResult } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormDialog } from "@/components/company/form-dialog";

const SECTORS = [
  "AI",
  "Fintech",
  "SaaS",
  "Healthtech",
  "Biotech",
  "Climate",
  "Consumer",
  "Crypto",
  "Deep Tech",
  "Marketplace",
];

export function AddCompanyDialog() {
  const router = useRouter();
  return (
    <FormDialog
      trigger={
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Add company
        </Button>
      }
      title="Add private company"
      description="Record a company you own or follow."
      action={createCompany}
      submitLabel="Create company"
      onSuccess={(s: ActionResult) => {
        if (s.id) router.push(`/companies/${s.id}`);
      }}
    >
      <Field label="Company name *">
        <Input name="name" required placeholder="OpenAI" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sector">
          <Input name="sector" list="sectors" placeholder="AI" />
          <datalist id="sectors">
            {SECTORS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Country">
          <Input name="country" placeholder="United States" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Website">
          <Input name="website" placeholder="https://openai.com" />
        </Field>
        <Field label="Founded year">
          <Input name="founded_year" type="number" placeholder="2015" />
        </Field>
      </div>
      <Field label="Founders (comma-separated)">
        <Input name="founders" placeholder="Sam Altman, Greg Brockman" />
      </Field>
      <Field label="Description">
        <Textarea name="description" placeholder="What the company does…" />
      </Field>
    </FormDialog>
  );
}
