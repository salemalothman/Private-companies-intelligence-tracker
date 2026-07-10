import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No R2/ISR infra for a plain SSR + Supabase app — omit incrementalCache to use
// the built-in dummy cache. Do NOT import r2-incremental-cache.
export default defineCloudflareConfig({});
