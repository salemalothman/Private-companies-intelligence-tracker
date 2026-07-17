"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus, Sparkles } from "lucide-react";
import { createCompany, enrichCompany } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CompanyTypeahead } from "@/components/company/company-typeahead";
import type { CompanyTypeaheadHandle } from "@/components/company/company-typeahead";
import type { CompanySuggestion } from "@/lib/connectors/akta";
import { cn, formatCurrency, hostFromWebsite } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/company/form-dialog";

const SECTORS = [
  "AI",
  "Fintech",
  "SaaS",
  "Dev Tools",
  "Healthtech",
  "Biotech",
  "Climate",
  "Consumer",
  "Crypto",
  "Deep Tech",
  "Marketplace",
];

type FormState = {
  name: string;
  sector: string;
  country: string;
  website: string;
  founded_year: string;
  founders: string;
  description: string;
  logo_url: string;
  entry_valuation: string;
  investment_amount: string;
  ownership_pct: string;
};

const EMPTY: FormState = {
  name: "",
  sector: "",
  country: "",
  website: "",
  founded_year: "",
  founders: "",
  description: "",
  logo_url: "",
  entry_valuation: "",
  investment_amount: "",
  ownership_pct: "",
};

/** Live currency preview using the app's global formatter, or null if empty/NaN. */
function currencyPreview(v: string): string | null {
  const s = v.replace(/[,$\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? formatCurrency(n) : null;
}

export function AddCompanyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [f, setF] = useState<FormState>(EMPTY);
  // Investment Details starts collapsed (progressive disclosure — the section
  // is optional and its 3 fields double the form's apparent length). Typed
  // values persist in `f` regardless of the disclosure state.
  const [showInvestment, setShowInvestment] = useState(false);

  // Fields populated by enrichment (vs. typed by the user) — so re-enriching
  // updates auto-filled fields but never clobbers the user's own edits.
  const autoFilled = useRef<Set<keyof FormState>>(new Set());
  const lastEnriched = useRef("");
  // Handle to the typeahead so Escape can close its dropdown before the dialog.
  const typeaheadRef = useRef<CompanyTypeaheadHandle>(null);

  // Debounced enrichment: typing a company name auto-fills the rest.
  useEffect(() => {
    const name = f.name.trim();
    if (name.length < 2 || name === lastEnriched.current) return;
    const timer = setTimeout(async () => {
      lastEnriched.current = name;
      setEnriching(true);
      const res = await enrichCompany(name);
      setEnriching(false);
      if (!res || res.error) return;
      setF((prev) => {
        const next = { ...prev };
        const apply = (key: keyof FormState, val?: string | number | null) => {
          if (val == null || val === "") return;
          if (next[key] === "" || autoFilled.current.has(key)) {
            next[key] = String(val);
            autoFilled.current.add(key);
          }
        };
        apply("sector", res.sector);
        apply("country", res.country);
        apply("website", res.website);
        apply("founded_year", res.foundedYear);
        apply("founders", res.founders?.join(", "));
        apply("description", res.description);
        apply("logo_url", res.logoUrl);
        return next;
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [f.name]);

  function userSet(key: keyof FormState, val: string) {
    autoFilled.current.delete(key);
    setF((prev) => ({ ...prev, [key]: val }));
  }

  // Fill the form from a picked typeahead suggestion. Picked fields are treated
  // as user-set (removed from autoFilled) so a later re-enrichment never clobbers
  // an explicit choice. Free-form type-and-submit stays unchanged.
  function handlePickSuggestion(s: CompanySuggestion) {
    autoFilled.current.delete("name");
    autoFilled.current.delete("website");
    autoFilled.current.delete("sector");
    setF((prev) => ({
      ...prev,
      name: s.name,
      website: s.website ? s.website : prev.website,
      sector: s.category ? s.category : prev.sector,
    }));
  }

  function reset() {
    setF(EMPTY);
    setError(null);
    autoFilled.current.clear();
    lastEnriched.current = "";
  }

  function submit() {
    if (!f.name.trim()) {
      setError("Company name is required.");
      return;
    }
    setError(null);
    start(async () => {
      const fd = new FormData();
      (Object.entries(f) as [keyof FormState, string][]).forEach(([k, v]) =>
        fd.set(k, v),
      );
      const res = await createCompany(undefined, fd);
      if (res.error) setError(res.error);
      else if (res.id) {
        setOpen(false);
        reset();
        router.push(`/companies/${res.id}`);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {/* mono: the designated primary on the dashboard/companies surfaces —
            white with a full-ink outline (inverts on hover), reading premium
            without a colored fill. Sync stays a quiet hairline outline. */}
        <Button variant="mono" className="gap-2">
          <Plus className="h-4 w-4" /> Add company
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => {
          // When the typeahead dropdown is open, the first Escape closes it —
          // not the dialog. preventDefault stops Radix's capture-phase handler
          // from dismissing the dialog (which would wipe the form). A second
          // Escape (dropdown now closed) falls through and closes the dialog.
          if (typeaheadRef.current?.isOpen()) {
            e.preventDefault();
            typeaheadRef.current.close();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Add private company</DialogTitle>
          <DialogDescription>Record a company you own or follow.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Company name *
            </label>
            <div className="flex items-center gap-3">
              {/* Circular brand-logo preview, resolved during enrichment. */}
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                {f.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.logo_url}
                    alt={`${f.name || "Company"} logo`}
                    className="h-full w-full object-contain"
                    onError={(e) => {
                      // Read the failed src now — the event is recycled before
                      // the setF updater runs. Fall back Clearbit -> Google
                      // favicon -> initial.
                      const failedSrc = e.currentTarget.src;
                      const domain = hostFromWebsite(f.website);
                      const favicon = domain
                        ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
                        : "";
                      setF((p) => ({
                        ...p,
                        logo_url:
                          favicon && !failedSrc.includes("google.com")
                            ? favicon
                            : "",
                      }));
                    }}
                  />
                ) : enriching ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-base font-semibold text-muted-foreground">
                    {f.name.trim() ? f.name.trim()[0].toUpperCase() : "?"}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <CompanyTypeahead
                  ref={typeaheadRef}
                  value={f.name}
                  onChange={(v) => setF((p) => ({ ...p, name: v }))}
                  onSelect={handlePickSuggestion}
                  placeholder="OpenAI"
                  autoFocus
                />
              </div>
            </div>
            {/* Helper line doubles as the enrichment indicator: while a lookup
                is in flight it swaps to a spinner + "Enriching…" (inline, so it
                never overlaps the fields below as the old floating badge did). */}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {enriching ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Enriching…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 text-primary" />
                  Fields below auto-fill from the name — edit any of them to
                  override.
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sector">
              {/* datalist lives outside the Field so the label/input id
                  pairing (single-element clone) applies. */}
              <Input
                value={f.sector}
                onChange={(e) => userSet("sector", e.target.value)}
                list="sectors"
                placeholder="AI"
              />
            </Field>
            <datalist id="sectors">
              {SECTORS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <Field label="Country">
              <Input
                value={f.country}
                onChange={(e) => userSet("country", e.target.value)}
                autoComplete="country-name"
                placeholder="United States"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Website">
              {/* inputMode="url" (not type="url"): the URL keyboard on mobile
                  without native scheme validation — enrichment or users often
                  supply bare "openai.com", which type="url" would reject. */}
              <Input
                value={f.website}
                onChange={(e) => userSet("website", e.target.value)}
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                placeholder="https://openai.com"
              />
            </Field>
            <Field label="Founded year">
              <Input
                value={f.founded_year}
                onChange={(e) => userSet("founded_year", e.target.value)}
                type="number"
                inputMode="numeric"
                placeholder="2015"
              />
            </Field>
          </div>

          <Field label="Founders (comma-separated)">
            <Input
              value={f.founders}
              onChange={(e) => userSet("founders", e.target.value)}
              placeholder="Sam Altman, Greg Brockman"
            />
          </Field>

          <Field label="Description">
            <Textarea
              value={f.description}
              onChange={(e) => userSet("description", e.target.value)}
              placeholder="What the company does…"
            />
          </Field>

          {/* Investment Details — optional entry metrics behind a disclosure
              so the core profile form stays short (progressive disclosure);
              typed values persist in state while collapsed. */}
          <div className="rounded-lg border border-border bg-muted/30">
            <button
              type="button"
              onClick={() => setShowInvestment((v) => !v)}
              aria-expanded={showInvestment}
              className="flex w-full items-center justify-between gap-2 rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <div>
                <h4 className="text-sm font-medium">
                  Investment Details
                  {!showInvestment &&
                    (f.entry_valuation || f.investment_amount || f.ownership_pct) !== "" && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        · filled
                      </span>
                    )}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Optional — record your entry to seed the valuation timeline and
                  portfolio metrics.
                </p>
              </div>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  showInvestment && "rotate-180",
                )}
              />
            </button>
            {showInvestment && (
            <div className="space-y-3 p-3 pt-0">
            <Field label="Your entry valuation ($)">
              <Input
                value={f.entry_valuation}
                onChange={(e) =>
                  setF((p) => ({ ...p, entry_valuation: e.target.value }))
                }
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="1000000000"
              />
              {currencyPreview(f.entry_valuation) && (
                <p className="text-xs tabular-nums text-muted-foreground">
                  = {currencyPreview(f.entry_valuation)}
                </p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Investment amount ($)">
                <Input
                  value={f.investment_amount}
                  onChange={(e) =>
                    setF((p) => ({ ...p, investment_amount: e.target.value }))
                  }
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder="500000"
                />
                {currencyPreview(f.investment_amount) && (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    = {currencyPreview(f.investment_amount)}
                  </p>
                )}
              </Field>
              <Field label="Ownership stake (%)">
                <Input
                  value={f.ownership_pct}
                  onChange={(e) =>
                    setF((p) => ({ ...p, ownership_pct: e.target.value }))
                  }
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  inputMode="decimal"
                  placeholder="2.5"
                />
              </Field>
            </div>
            </div>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create company"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
