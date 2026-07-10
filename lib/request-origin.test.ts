import { describe, expect, it } from "vitest";
import { requestOrigin } from "@/lib/request-origin";

// Tiny fake header bag mirroring the Headers/next-headers `get` contract.
const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });

describe("requestOrigin", () => {
  it("uses x-forwarded-host + x-forwarded-proto when present", () => {
    expect(
      requestOrigin(
        h({
          "x-forwarded-host": "private-companies-tracker.salem-alothman.workers.dev",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://private-companies-tracker.salem-alothman.workers.dev");
  });

  it("falls back to host with default http proto when no forwarded headers", () => {
    expect(requestOrigin(h({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("prefers x-forwarded-host over host when both present", () => {
    expect(
      requestOrigin(
        h({
          "x-forwarded-host": "edge.example.com",
          host: "origin.internal",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://edge.example.com");
  });

  it("returns null when no host header at all", () => {
    expect(requestOrigin(h({}))).toBeNull();
  });
});
