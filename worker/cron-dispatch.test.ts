import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CRON_ROUTES, dispatchScheduled } from "@/worker/cron-dispatch";

describe("dispatchScheduled", () => {
  it("dispatches co-scheduled 06:00 routes in order with the bearer header", async () => {
    const calls: { path: string; auth: string | null }[] = [];
    const fetchFn = async (req: Request) => {
      const url = new URL(req.url);
      calls.push({ path: url.pathname, auth: req.headers.get("authorization") });
      return new Response("ok");
    };

    const attempted = await dispatchScheduled("0 6 * * *", fetchFn, "sekret");

    expect(attempted).toEqual([
      "/api/cron/daily-refresh",
      "/api/cron/news-sentiment",
    ]);
    // daily-refresh must finish before news-sentiment starts (Vercel ordering).
    expect(calls.map((c) => c.path)).toEqual([
      "/api/cron/daily-refresh",
      "/api/cron/news-sentiment",
    ]);
    expect(calls.every((c) => c.auth === "Bearer sekret")).toBe(true);
  });

  it("isolates a failing route so co-scheduled routes still run", async () => {
    const seen: string[] = [];
    const fetchFn = async (req: Request) => {
      const path = new URL(req.url).pathname;
      seen.push(path);
      if (path.endsWith("daily-refresh")) throw new Error("boom");
      return new Response("ok");
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const attempted = await dispatchScheduled("0 6 * * *", fetchFn, "s");
    errSpy.mockRestore();

    // Both routes were attempted even though the first threw.
    expect(seen).toEqual([
      "/api/cron/daily-refresh",
      "/api/cron/news-sentiment",
    ]);
    expect(attempted).toHaveLength(2);
  });

  it("is a logged no-op for an unmapped cron expression", async () => {
    const fetchFn = vi.fn(async () => new Response("ok"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const attempted = await dispatchScheduled("* * * * *", fetchFn, "s");

    expect(attempted).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("CRON_ROUTES keys exactly match wrangler.jsonc triggers.crons", () => {
    const raw = readFileSync("wrangler.jsonc", "utf8");
    // Strip JSONC comments before parsing: block comments, then line comments
    // (the `[^:]` guard leaves `https://` URLs untouched).
    const json = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const cfg = JSON.parse(json) as { triggers: { crons: string[] } };

    expect([...Object.keys(CRON_ROUTES)].sort()).toEqual(
      [...cfg.triggers.crons].sort(),
    );
  });
});
