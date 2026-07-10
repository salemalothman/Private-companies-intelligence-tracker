import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { exaCompanyEventsFor } from "@/lib/connectors/exa";
import { screenCompanyEvent } from "@/lib/enrichment/disambiguation";

type DB = SupabaseClient<Database>;

export interface ExaEventsSummary {
  companies: number;
  found: number;
  inserted: number;
  status: "success" | "partial";
  detail?: string;
}

/**
 * Exa events sweep: for each tracked company, search the web for scheduled
 * corporate events, fresh valuations, and secondary-market share prices, and
 * upsert them into company_events (deduped by the table's unique index).
 *
 * Pass `userId` to scope to a single user (manual trigger); omit for the weekly
 * cron over all users (service-role client). Each company is isolated so one
 * failure degrades the run to "partial" without stopping it.
 */
export async function runExaEventsSync(
  supabase: DB,
  opts: { userId?: string } = {},
): Promise<ExaEventsSummary> {
  let q = supabase
    .from("companies")
    .select("id, user_id, name, country");
  if (opts.userId) q = q.eq("user_id", opts.userId);
  const { data: companies, error } = await q;
  if (error)
    return { companies: 0, found: 0, inserted: 0, status: "partial", detail: error.message };

  let found = 0;
  let inserted = 0;
  const errors: string[] = [];

  for (const c of companies ?? []) {
    try {
      const events = await exaCompanyEventsFor(c.name);
      found += events.length;
      if (!events.length) continue;

      // Pre-filter against existing rows (the table's unique index treats a null
      // date as one value via coalesce, so we mirror that with `?? ""`).
      const { data: prior } = await supabase
        .from("company_events")
        .select("type, title, event_date")
        .eq("company_id", c.id);
      const seen = new Set(
        (prior ?? []).map((e) => `${e.type}|${e.title}|${e.event_date ?? ""}`),
      );

      const rows = events
        // Screen each event against the wrong-entity / generic-report guard.
        // Tracked portfolio companies are private by default; a dropped event is
        // skipped entirely. The screen only decides keep-vs-drop — the event's
        // own value is stored verbatim, never rewritten.
        .map((e) => {
          const screen = screenCompanyEvent(
            {
              name: c.name,
              country: c.country,
              isPrivate: true,
            },
            {
              type: e.type,
              title: e.title,
              detail: e.detail ?? null,
              url: e.url ?? null,
              value: e.value ?? null,
            },
          );
          if (screen.drop) return null;
          return {
            company_id: c.id,
            user_id: c.user_id,
            type: e.type,
            title: e.title.slice(0, 300),
            detail: e.detail ?? null,
            event_date: e.eventDate ?? null,
            value: e.value ?? null,
            source: "exa",
            url: e.url ?? null,
          };
        })
        .filter(
          (r): r is NonNullable<typeof r> =>
            r !== null &&
            !seen.has(`${r.type}|${r.title}|${r.event_date ?? ""}`),
        );
      if (!rows.length) continue;

      const { error: insErr } = await supabase.from("company_events").insert(rows);
      if (insErr) errors.push(`${c.name}: ${insErr.message}`);
      else inserted += rows.length;
    } catch (e) {
      errors.push(`${c.name}: ${(e as Error).message}`);
    }
  }

  return {
    companies: companies?.length ?? 0,
    found,
    inserted,
    status: errors.length ? "partial" : "success",
    detail: errors.length ? errors.slice(0, 3).join("; ") : undefined,
  };
}
