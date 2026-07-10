// Custom Cloudflare Workers entrypoint.
//
// WHY this exists: the OpenNext build normally points wrangler `main` straight
// at the generated `.open-next/worker.js`, which only exports a `fetch` handler.
// Cloudflare Cron Triggers require a `scheduled()` handler, so we wrap the
// generated worker: delegate `fetch` to it unchanged and add a `scheduled()`
// dispatcher that fires the existing bearer-authenticated cron routes IN-PROCESS.
//
// The dispatch is a synthetic Request through the generated fetch handler — never
// a network self-fetch. `global_fetch_strictly_public` (see wrangler.jsonc) makes
// a Worker fetching its own public hostname unreliable, so we route in-process.

// The generated worker is a gitignored build artifact absent at tsc time; the
// opennextjs-cloudflare build resolves it. `worker/` is excluded from tsc.
// @ts-expect-error: resolved by opennextjs-cloudflare build
import generated from "../.open-next/worker.js";
// Re-export the artifact's Durable Object classes so they stay bound if OpenNext
// caching DOs are enabled later. Harmless today (no durable_objects binding).
// @ts-expect-error: resolved by opennextjs-cloudflare build
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";

// Minimal local Workers types — @cloudflare/workers-types is not installed, and
// these exist only so the handler reads clearly.
interface ScheduledController {
  cron: string;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}
interface Env {
  CRON_SECRET: string;
}

// Cron expression -> route path. Keys copied verbatim from vercel.json so the
// Cloudflare schedule mirrors Vercel exactly. All six expressions are unique.
const CRON_ROUTES: Record<string, string> = {
  "0 13 * * 1": "/api/cron/market-sync",
  "0 6 * * *": "/api/cron/daily-refresh",
  "30 6 * * *": "/api/cron/news-sentiment",
  "0 14 * * 1": "/api/cron/exa-events",
  "0 4 * * 1": "/api/cron/global-sync",
  "0 8 * * 1": "/api/cron/weekly-digest",
};

const defaultExport = {
  fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    // Wrapper method (not `generated.fetch` by reference) to avoid any
    // `this`-binding surprise inside the generated handler.
    return generated.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: Ctx): Promise<void> {
    const path = CRON_ROUTES[controller.cron];
    if (!path) {
      // Unknown/unmapped schedule: log and no-op — never dispatch or throw.
      console.error("worker: unmapped cron expression:", controller.cron);
      return;
    }
    // The host is arbitrary and never network-fetched; the request is handled
    // in-process by the generated worker. Bearer matches what the routes verify.
    const req = new Request(`https://cron.internal${path}`, {
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    ctx.waitUntil(defaultExport.fetch(req, env, ctx));
  },
};

export default defaultExport;
