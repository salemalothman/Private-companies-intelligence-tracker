import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { scoreSentiment } from "@/lib/news/classify";

type DB = SupabaseClient<Database>;

export interface SentimentRunSummary {
  scored: number;
  status: "success" | "partial";
  detail?: string;
}

/**
 * News-sentiment agent: scans stored news articles that have no sentiment yet,
 * scores each, and writes it back. Runs under the service-role client so it
 * covers every user's news. Idempotent — only unscored rows are touched, so it
 * can run on a schedule without churning existing classifications.
 */
export async function runSentimentAgent(supabase: DB): Promise<SentimentRunSummary> {
  const { data, error } = await supabase
    .from("news")
    .select("id, title, summary")
    .is("sentiment", null);
  if (error) return { scored: 0, status: "partial", detail: error.message };

  let scored = 0;
  const errors: string[] = [];
  for (const n of data ?? []) {
    const sentiment = scoreSentiment(n.title, n.summary);
    const { error: upErr } = await supabase
      .from("news")
      .update({ sentiment })
      .eq("id", n.id);
    if (upErr) errors.push(upErr.message);
    else scored += 1;
  }

  return {
    scored,
    status: errors.length ? "partial" : "success",
    detail: errors.length ? errors.slice(0, 3).join("; ") : undefined,
  };
}
