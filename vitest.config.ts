import { defineConfig, configDefaults } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // Keep vitest's defaults, and also ignore GSD git worktrees under .claude/ —
    // their stale duplicate *.test.ts copies otherwise leak into the glob and run
    // (and hang) alongside the main tree's suite.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      // `server-only` throws when imported outside a React Server Component build.
      // Under Vitest (plain Node) it has no meaning, so stub it to a no-op so pure
      // helpers that live in a `server-only` module (e.g. lib/agents/deep-dive.ts)
      // remain unit-testable without weakening the server-only guard in the app build.
      "server-only": resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
});
