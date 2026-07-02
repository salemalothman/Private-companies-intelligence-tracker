// Vitest stub for the `server-only` package. In a Next.js build `server-only`
// throws if a server-only module is pulled into a client bundle; under Vitest
// (plain Node, no RSC boundary) that guard is irrelevant, so this is a no-op.
// Aliased via vitest.config.ts so pure helpers that must live in a server-only
// module (per the deep-dive agent's `import "server-only"` first line) stay
// unit-testable. Not shipped — test-only.
export {};
