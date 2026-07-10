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

  it("prefers x-forwarded-host over host when both are allowlisted", () => {
    expect(
      requestOrigin(
        h({
          "x-forwarded-host": "pr-42-private-companies-tracker.vercel.app",
          host: "origin.internal",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://pr-42-private-companies-tracker.vercel.app");
  });

  it("returns null when no host header at all", () => {
    expect(requestOrigin(h({}))).toBeNull();
  });

  it("returns null for a non-allowlisted (attacker) forwarded host", () => {
    // Host-header injection: an untrusted host must never seed a reset link.
    expect(
      requestOrigin(
        h({ "x-forwarded-host": "attacker.example.com", "x-forwarded-proto": "https" }),
      ),
    ).toBeNull();
  });

  it("accepts *.vercel.app and *.workers.dev, rejects look-alikes", () => {
    expect(
      requestOrigin(h({ "x-forwarded-host": "app.vercel.app", "x-forwarded-proto": "https" })),
    ).toBe("https://app.vercel.app");
    // Look-alike hosts that merely contain the suffix without the leading dot.
    expect(
      requestOrigin(h({ "x-forwarded-host": "workers.dev.evil.com" })),
    ).toBeNull();
    expect(
      requestOrigin(h({ "x-forwarded-host": "evil-workers.dev" })),
    ).toBeNull();
  });
});
