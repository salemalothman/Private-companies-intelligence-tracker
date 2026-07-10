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
// The schedule→route mapping and the failure-isolated dispatch loop live in the
// pure, unit-tested ./cron-dispatch module.

// The generated worker is a gitignored build artifact absent at tsc time; its
// shape is declared in ./open-next-worker.d.ts so `tsc -p worker` resolves this
// import, and the opennextjs-cloudflare build supplies the real module.
import generated from "../.open-next/worker.js";
// Re-export the artifact's Durable Object classes so they stay bound if OpenNext
// caching DOs are enabled later. Harmless today (no durable_objects binding).
export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "../.open-next/worker.js";
import { dispatchScheduled } from "./cron-dispatch";

interface Env {
  CRON_SECRET: string;
}

const defaultExport = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Wrapper method (not `generated.fetch` by reference) to avoid any
    // `this`-binding surprise inside the generated handler.
    return generated.fetch(request, env, ctx);
  },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Route in-process through the generated fetch handler; each cron route is
    // failure-isolated inside dispatchScheduled so one crash never skips the rest.
    ctx.waitUntil(
      dispatchScheduled(
        controller.cron,
        (req) => defaultExport.fetch(req, env, ctx),
        env.CRON_SECRET,
      ),
    );
  },
};

export default defaultExport;
