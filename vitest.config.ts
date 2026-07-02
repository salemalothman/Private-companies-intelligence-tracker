import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
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
