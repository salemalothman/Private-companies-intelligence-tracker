"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Loader2 } from "lucide-react";
import { searchCompaniesAction } from "@/app/(app)/companies/actions";
import type { CompanySuggestion } from "@/lib/connectors/akta";
import { Input } from "@/components/ui/input";
import { cn, hostFromWebsite } from "@/lib/utils";

type CompanyTypeaheadProps = {
  value: string;
  onChange: (name: string) => void;
  onSelect: (suggestion: CompanySuggestion) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

/**
 * Imperative handle exposed to the parent so it can coordinate the Escape key:
 * Radix's DialogContent listens for Escape on the document capture phase and
 * closes the dialog unless the event is `defaultPrevented`. The parent queries
 * {@link isOpen} in its `onEscapeKeyDown` and, when the dropdown is showing,
 * prevents the dialog close and calls {@link close} instead (first Escape closes
 * the dropdown, second closes the dialog).
 */
export type CompanyTypeaheadHandle = {
  isOpen: () => boolean;
  close: () => void;
};

/**
 * Debounced private-only company search input for the Add Company flow. As the
 * user types (>=2 chars), it polls {@link searchCompaniesAction} and renders a
 * dropdown of private-company suggestions (logo + name + brief line) so
 * similarly-named entities can be visually disambiguated. Public-market
 * companies are excluded server-side. Selecting a row fills the parent form;
 * free-form typing + submit are unaffected (the input still drives `value`).
 */
export const CompanyTypeahead = forwardRef<
  CompanyTypeaheadHandle,
  CompanyTypeaheadProps
>(function CompanyTypeahead(
  { value, onChange, onSelect, placeholder, autoFocus },
  ref,
) {
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Stable, unique ids for the WAI-ARIA combobox wiring (listbox + options).
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  // Monotonic request sequence: only the latest fire may commit results, so a
  // slow earlier response can never overwrite a newer one (out-of-order guard).
  const seq = useRef(0);
  // Close-on-blur is delayed so a row's mousedown/click still registers.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The name we just committed via pick(): suppress the re-open the parent's
  // programmatic value change would otherwise trigger. Cleared on user edit.
  const lastPicked = useRef<string | null>(null);
  // Small bounded client cache (trimmed-lowercase query -> results) so repeat
  // queries (e.g. backspacing) resolve instantly without a server round-trip.
  const cache = useRef<Map<string, CompanySuggestion[]>>(new Map());

  useEffect(() => {
    const q = value.trim();
    // Value was set programmatically by pick() — do not fetch or re-open.
    if (value === lastPicked.current) return;
    if (q.length < 2) {
      // Invalidate any in-flight response so it can't commit after we clear.
      seq.current++;
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    const key = q.toLowerCase();
    const mySeq = ++seq.current;
    const cached = cache.current.get(key);
    if (cached) {
      setLoading(false);
      setSuggestions(cached);
      setActiveIndex(-1);
      setOpen(true);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await searchCompaniesAction(q);
      // Ignore stale responses — a newer keystroke already superseded this one.
      if (mySeq !== seq.current) return;
      const list = res.suggestions ?? [];
      // Cache non-empty results only: an empty list may be a transient akta
      // failure or the server throttle's degraded response — pinning it would
      // show "no results" forever for a query that actually has matches.
      if (list.length > 0) {
        // Drop the oldest entry once we hit the ~50-entry cap.
        if (cache.current.size >= 50) {
          const oldest = cache.current.keys().next().value;
          if (oldest !== undefined) cache.current.delete(oldest);
        }
        cache.current.set(key, list);
      }
      setLoading(false);
      setSuggestions(list);
      setActiveIndex(-1);
      setOpen(true);
      // 350ms sits above the server action's 300ms per-user throttle floor, so
      // a natural typing cadence never gets a request throttled to empty.
    }, 350);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
    };
  }, []);

  const showDropdown = open && value.trim().length >= 2;

  useImperativeHandle(
    ref,
    () => ({
      isOpen: () => showDropdown,
      close: () => {
        setOpen(false);
        setActiveIndex(-1);
      },
    }),
    [showDropdown],
  );

  function pick(suggestion: CompanySuggestion) {
    // Record the picked name so the parent's programmatic value update doesn't
    // immediately re-open the dropdown, and invalidate any in-flight search.
    lastPicked.current = suggestion.name;
    seq.current++;
    onSelect(suggestion);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    // The seq bump above orphans any in-flight fetch (its setLoading(false)
    // never runs), so clear the spinner here.
    setLoading(false);
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
      // Only commit when a row is actually highlighted; otherwise just close
      // the dropdown and leave the typed value untouched (no [0] fallback).
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        pick(suggestions[activeIndex]);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          // Any user edit re-arms search after a pick.
          lastPicked.current = null;
          onChange(e.target.value);
        }}
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
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          showDropdown && activeIndex >= 0 ? optionId(activeIndex) : undefined
        }
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
            // div, not ul: option buttons must be DIRECT children of the
            // listbox for ARIA ownership, and ul only permits li children.
            <div id={listboxId} role="listbox" aria-label="Company suggestions">
              {suggestions.map((s, i) => {
                const host = hostFromWebsite(s.website);
                const brief = s.category ?? host ?? "";
                return (
                  <button
                    key={s.uuid ?? `${s.name}-${i}`}
                    type="button"
                    role="option"
                    id={optionId(i)}
                    aria-selected={i === activeIndex}
                    // onMouseDown (not onClick) so the pick fires before the
                    // input's blur-close timer hides the row.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(s);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left",
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
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

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
