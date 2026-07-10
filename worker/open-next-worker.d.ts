// Ambient stub for the OpenNext build artifact (`../.open-next/worker.js`), a
// gitignored build output that is absent at typecheck time. Declaring its shape
// here lets `tsc -p worker` resolve the import in index.ts without an
// @ts-expect-error; the real module is produced by `opennextjs-cloudflare build`.
// Wildcard specifier (`*` matches the `..` prefix): an exact relative ambient
// module is not honoured by TS for a non-existent file, but a wildcard pattern
// is, and it applies to relative imports.
declare module "*/.open-next/worker.js" {
  const handler: {
    fetch(
      request: Request,
      env: unknown,
      ctx: ExecutionContext,
    ): Promise<Response>;
  };
  export default handler;
  export const DOQueueHandler: unknown;
  export const DOShardedTagCache: unknown;
  export const BucketCachePurge: unknown;
}
