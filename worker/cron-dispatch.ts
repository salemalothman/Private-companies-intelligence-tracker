// Pure Cloudflare Cron dispatch logic.
//
// WHY this is a separate module: it holds the schedule → route mapping and the
// dispatch loop with zero dependency on the OpenNext build artifact
// (`../.open-next/worker.js`), so it is directly unit-testable without a build.
// `worker/index.ts` wires this to the real generated `fetch` handler.

/** A fetch-like handler — the generated OpenNext worker's `fetch`, pre-bound. */
export type FetchFn = (request: Request) => Promise<Response>;

/**
 * Cron expression -> route path(s). Schedules mirror vercel.json, except
 * daily-refresh + news-sentiment share the 06:00 trigger (dispatched
 * sequentially, preserving Vercel's 30-minute ordering) because the Workers
 * free plan caps an account at 5 cron triggers.
 *
 * The key set MUST stay in lockstep with `triggers.crons` in wrangler.jsonc —
 * enforced by cron-dispatch.test.ts.
 */
export const CRON_ROUTES: Record<string, string[]> = {
  "0 13 * * 1": ["/api/cron/market-sync"],
  "0 6 * * *": ["/api/cron/daily-refresh", "/api/cron/news-sentiment"],
  "0 14 * * 1": ["/api/cron/exa-events"],
  "0 4 * * 1": ["/api/cron/global-sync"],
  "0 8 * * 1": ["/api/cron/weekly-digest"],
};

/**
 * Dispatch every route mapped to `cron` through `fetchFn` in-process, in order.
 * Each path is isolated in its own try/catch so one failing cron route can never
 * abort the co-scheduled routes (06:00 fans out to two) — a single crash must not
 * silently skip the rest of that trigger. Requests carry the bearer the cron
 * routes verify; the host is arbitrary and never network-fetched. Returns the
 * paths that were attempted; an unmapped expression is a logged no-op ([]).
 */
export async function dispatchScheduled(
  cron: string,
  fetchFn: FetchFn,
  secret: string,
): Promise<string[]> {
  const paths = CRON_ROUTES[cron];
  if (!paths) {
    console.error("worker: unmapped cron expression:", cron);
    return [];
  }
  for (const path of paths) {
    try {
      const req = new Request(`https://cron.internal${path}`, {
        headers: { authorization: `Bearer ${secret}` },
      });
      await fetchFn(req);
    } catch (e) {
      // Isolate failures: a thrown route must never abort the co-scheduled ones.
      console.error(`worker: cron route ${path} failed:`, (e as Error).message);
    }
  }
  return paths;
}
