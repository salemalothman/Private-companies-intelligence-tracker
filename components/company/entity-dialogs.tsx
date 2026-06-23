"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import {
  addFundingRound,
  addInvestment,
  addNews,
  addValuation,
} from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormDialog } from "@/components/company/form-dialog";

const ROUNDS = [
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Growth",
];

// Must forward ref + props so Radix's DialogTrigger (asChild) can wire its
// onClick/aria/data-state onto the underlying button.
const AddButton = React.forwardRef<
  HTMLButtonElement,
  { label: string } & React.ComponentProps<typeof Button>
>(({ label, ...props }, ref) => (
  <Button ref={ref} size="sm" variant="outline" className="gap-2" {...props}>
    <Plus className="h-4 w-4" /> {label}
  </Button>
));
AddButton.displayName = "AddButton";

export function AddInvestmentDialog({ companyId }: { companyId: string }) {
  return (
    <FormDialog
      trigger={<AddButton label="Add investment" />}
      title="Record an investment"
      action={addInvestment.bind(null, companyId)}
      submitLabel="Add investment"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Investment date *">
          <Input name="investment_date" type="date" required />
        </Field>
        <Field label="Investment round">
          <Input name="round" list="rounds" placeholder="Series A" />
          <datalist id="rounds">
            {ROUNDS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount invested ($)">
          <Input name="amount" type="number" step="any" placeholder="500000" />
        </Field>
        <Field label="Share price ($)">
          <Input name="share_price" type="number" step="any" placeholder="25" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Number of shares">
          <Input name="shares" type="number" step="any" placeholder="20000" />
        </Field>
        <Field label="Ownership %">
          <Input
            name="ownership_pct"
            type="number"
            step="any"
            placeholder="0.05"
          />
        </Field>
      </div>
      <Field label="Investor name">
        <Input name="investor_name" placeholder="Your fund / SPV" />
      </Field>
      <Field label="Terms">
        <Input name="terms" placeholder="SAFE, priced round, pro-rata…" />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" placeholder="Any context on this investment…" />
      </Field>
    </FormDialog>
  );
}

export function AddValuationDialog({ companyId }: { companyId: string }) {
  return (
    <FormDialog
      trigger={<AddButton label="Add valuation" />}
      title="Add valuation point"
      description="Record a valuation at a point in time."
      action={addValuation.bind(null, companyId)}
      submitLabel="Add valuation"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date *">
          <Input name="date" type="date" required />
        </Field>
        <Field label="Round">
          <Input name="round" list="vrounds" placeholder="Series B" />
          <datalist id="vrounds">
            {ROUNDS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pre-money ($)">
          <Input name="pre_money" type="number" step="any" placeholder="900000000" />
        </Field>
        <Field label="Post-money ($)">
          <Input
            name="post_money"
            type="number"
            step="any"
            placeholder="1000000000"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Share price ($)">
          <Input name="share_price" type="number" step="any" placeholder="50" />
        </Field>
        <Field label="Confidence">
          <select
            name="confidence"
            defaultValue="medium"
            className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 text-base sm:h-9 sm:text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
      </div>
      <Field label="Source">
        <Input name="source" placeholder="Pitch deck, news, cap table…" />
      </Field>
    </FormDialog>
  );
}

export function AddNewsDialog({ companyId }: { companyId: string }) {
  return (
    <FormDialog
      trigger={<AddButton label="Add news" />}
      title="Add news / update"
      description="Record a news item, announcement, or update."
      action={addNews.bind(null, companyId)}
      submitLabel="Add news"
    >
      <Field label="Headline *">
        <Input name="title" required placeholder="Company raises Series C" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input name="date" type="date" />
        </Field>
        <Field label="Sentiment">
          <select
            name="sentiment"
            defaultValue="neutral"
            className="flex h-10 w-full rounded-md border border-border bg-transparent px-3 text-base sm:h-9 sm:text-sm"
          >
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Source">
          <Input name="source" placeholder="TechCrunch, Reuters…" />
        </Field>
        <Field label="URL">
          <Input name="url" placeholder="https://…" />
        </Field>
      </div>
      <Field label="Summary">
        <Textarea name="summary" placeholder="What happened…" />
      </Field>
    </FormDialog>
  );
}

export function AddFundingRoundDialog({ companyId }: { companyId: string }) {
  return (
    <FormDialog
      trigger={<AddButton label="Add funding round" />}
      title="Add funding round"
      action={addFundingRound.bind(null, companyId)}
      submitLabel="Add round"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Round *">
          <Input name="round" list="frounds" required placeholder="Series B" />
          <datalist id="frounds">
            {ROUNDS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Date">
          <Input name="date" type="date" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount raised ($)">
          <Input
            name="amount_raised"
            type="number"
            step="any"
            placeholder="100000000"
          />
        </Field>
        <Field label="Valuation ($)">
          <Input
            name="valuation"
            type="number"
            step="any"
            placeholder="2000000000"
          />
        </Field>
      </div>
      <Field label="Lead investor">
        <Input name="lead_investor" placeholder="Sequoia" />
      </Field>
      <Field label="Investors (comma-separated)">
        <Input name="investors" placeholder="Sequoia, a16z, Thrive" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Share price ($)">
          <Input name="share_price" type="number" step="any" placeholder="50" />
        </Field>
        <Field label="Source">
          <Input name="source" placeholder="TechCrunch, press release…" />
        </Field>
      </div>
    </FormDialog>
  );
}
