"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { createCompany, enrichCompany } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
};

const EMPTY: FormState = {
  name: "",
  sector: "",
  country: "",
  website: "",
  founded_year: "",
  founders: "",
  description: "",
};

export function AddCompanyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [f, setF] = useState<FormState>(EMPTY);

  // Fields populated by enrichment (vs. typed by the user) — so re-enriching
  // updates auto-filled fields but never clobbers the user's own edits.
  const autoFilled = useRef<Set<keyof FormState>>(new Set());
  const lastEnriched = useRef("");

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
        return next;
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [f.name]);

  function userSet(key: keyof FormState, val: string) {
    autoFilled.current.delete(key);
    setF((prev) => ({ ...prev, [key]: val }));
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
        <Button variant="outline" className="gap-2">
          <Plus className="h-4 w-4" /> Add company
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add private company</DialogTitle>
          <DialogDescription>Record a company you own or follow.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Company name *
            </label>
            <div className="relative">
              <Input
                value={f.name}
                onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
                placeholder="OpenAI"
                autoFocus
              />
              {enriching && (
                <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> enriching…
                </span>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              Fields below auto-fill from the name — edit any of them to override.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sector">
              <Input
                value={f.sector}
                onChange={(e) => userSet("sector", e.target.value)}
                list="sectors"
                placeholder="AI"
              />
              <datalist id="sectors">
                {SECTORS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="Country">
              <Input
                value={f.country}
                onChange={(e) => userSet("country", e.target.value)}
                placeholder="United States"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Website">
              <Input
                value={f.website}
                onChange={(e) => userSet("website", e.target.value)}
                placeholder="https://openai.com"
              />
            </Field>
            <Field label="Founded year">
              <Input
                value={f.founded_year}
                onChange={(e) => userSet("founded_year", e.target.value)}
                type="number"
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

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
