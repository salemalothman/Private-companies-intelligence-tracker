"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateAlertPrefs } from "@/app/(app)/dashboard/actions";
import type { AlertPrefsView } from "@/lib/queries";

const TYPES: { key: keyof AlertPrefsView; label: string; hint: string }[] = [
  { key: "funding_round", label: "Funding rounds", hint: "New rounds raised" },
  { key: "valuation", label: "Valuation moves", hint: "Mark-ups and mark-downs" },
  { key: "contract_win", label: "Contract wins", hint: "Material deals & partnerships" },
  { key: "competitor", label: "New competitors", hint: "Newly tracked rivals" },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
          on ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function AlertPrefsDialog({ prefs }: { prefs: AlertPrefsView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<AlertPrefsView>(prefs);

  function save() {
    start(() =>
      updateAlertPrefs(draft).then(() => {
        setOpen(false);
        router.refresh();
      }),
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(prefs); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Alert preferences">
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alert preferences</DialogTitle>
          <DialogDescription>
            Choose which changes are recorded to the activity feed and digest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {TYPES.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.hint}</div>
              </div>
              <Toggle
                on={Boolean(draft[t.key])}
                onClick={() => setDraft((d) => ({ ...d, [t.key]: !d[t.key] }))}
              />
            </div>
          ))}

          <div className="border-t border-border pt-3">
            <Label htmlFor="valmin" className="text-sm font-medium">
              Minimum valuation move (%)
            </Label>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Only flag valuation changes at or above this size. 0 records all.
            </p>
            <Input
              id="valmin"
              type="number"
              min="0"
              step="any"
              value={draft.valuation_min_pct}
              disabled={!draft.valuation}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  valuation_min_pct: Number(e.target.value) || 0,
                }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save preferences"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
