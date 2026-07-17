"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { searchCompaniesAction } from "@/app/(app)/companies/actions";
import type { CompanySuggestion } from "@/lib/connectors/akta";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CompanyTypeaheadProps = {
  value: string;
  onChange: (name: string) => void;
  onSelect: (suggestion: CompanySuggestion) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

/** Bare hostname from a website URL, for building a Clearbit logo URL. */
function hostFromUrl(website: string | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(
      website.startsWith("http") ? website : `https://${website}`,
    );
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Debounced private-only company search input for the Add Company flow. As the
 * user types (>=2 chars), it polls {@link searchCompaniesAction} and renders a
 * dropdown of private-company suggestions (logo + name + brief line) so
 * similarly-named entities can be visually disambiguated. Public-market
 * companies are excluded server-side. Selecting a row fills the parent form;
 * free-form typing + submit are unaffected (the input still drives `value`).
 */
export function CompanyTypeahead({
  value,
  onChange,
  onSelect,
  placeholder,
  autoFocus,
}: CompanyTypeaheadProps) {
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Monotonic request sequence: only the latest fire may commit results, so a
  // slow earlier response can never overwrite a newer one (out-of-order guard).
  const seq = useRef(0);
  // Close-on-blur is delayed so a row's mousedown/click still registers.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    const mySeq = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await searchCompaniesAction(q);
      // Ignore stale responses — a newer keystroke already superseded this one.
      if (mySeq !== seq.current) return;
      setLoading(false);
      setSuggestions(res.suggestions ?? []);
      setActiveIndex(-1);
      setOpen(true);
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  function pick(suggestion: CompanySuggestion) {
    onSelect(suggestion);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      const target = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
      if (target) {
        e.preventDefault();
        pick(target);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showDropdown = open && value.trim().length >= 2;

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (value.trim().length >= 2 && suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {loading && (
        <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
      )}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
          {suggestions.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              {loading ? "Searching…" : "No private companies found."}
            </p>
          ) : (
            <ul role="listbox">
              {suggestions.map((s, i) => {
                const host = hostFromUrl(s.website);
                const brief = s.category ?? host ?? "";
                return (
                  <li key={s.uuid ?? `${s.name}-${i}`} role="option" aria-selected={i === activeIndex}>
                    <button
                      type="button"
                      // onMouseDown (not onClick) so the pick fires before the
                      // input's blur-close timer hides the row.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(s);
                      }}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left touch-action-manipulation",
                        i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                      )}
                    >
                      <SuggestionLogo name={s.name} host={host} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {s.name}
                        </span>
                        {brief && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {brief}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Row logo block: a Clearbit logo derived from the suggestion's hostname, with a
 * monogram-initial fallback on load error (matching the dialog's circular
 * treatment, sized for a row). Purely presentational — no network fetch beyond
 * the browser's own `<img>` load, which verifies the URL and falls back on 404.
 */
function SuggestionLogo({
  name,
  host,
}: {
  name: string;
  host: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim() ? name.trim()[0].toUpperCase() : "?";
  const showImg = host && !failed;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://logo.clearbit.com/${host}`}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {initial}
        </span>
      )}
    </span>
  );
}
