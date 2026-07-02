import { describe, expect, it } from "vitest";
import { appOnlyLaneReady, mapTweetsResult } from "@/lib/ingest/x-twitter";
import type { IngestTarget } from "@/lib/ingest/types";

const target: IngestTarget = {
  companyId: "co-123",
  userId: "user-456",
  subject: "Replit",
  kind: "company",
  domain: "replit.com",
};

/**
 * A `doctor --agent` result as x-twitter-pp-cli emits it inside the `results`
 * payload: `auth_lanes` keyed by lane, each carrying a `status`. The app-only
 * lane is "confirmed"/"ok" when X_BEARER_TOKEN is usable and "missing" when no
 * bearer token is configured.
 */
const doctorReady = {
  auth_lanes: {
    app_only_api: { status: "confirmed" },
    user_context: { status: "missing" },
  },
};

const doctorMissing = {
  auth_lanes: {
    app_only_api: { status: "missing" },
  },
};

const doctorAbsentLane = {
  auth_lanes: {
    user_context: { status: "confirmed" },
  },
};

/**
 * A `sync --resources tweets --agent` result as the CLI emits it inside the
 * `results` payload: a `tweets` array where each tweet carries an id, text,
 * author, timestamp, url and a public-metrics map.
 */
const tweetsResult = {
  handle: "replit",
  tweets: [
    {
      id: "1801234567890123456",
      text: "Replit Agent now ships full-stack apps.",
      author: "replit",
      created_at: "2026-06-28T12:00:00Z",
      url: "https://x.com/replit/status/1801234567890123456",
      metrics: { likes: 1200, reposts: 340, replies: 88 },
    },
    {
      id: "1801234567890123457",
      text: "We crossed 40M developers.",
      author: "replit",
      created_at: "2026-06-27T09:30:00Z",
      url: "https://x.com/replit/status/1801234567890123457",
      metrics: { likes: 5000, reposts: 900, replies: 210 },
    },
  ],
};

describe("appOnlyLaneReady", () => {
  it("returns true when auth_lanes.app_only_api.status is present and not 'missing'", () => {
    expect(appOnlyLaneReady(doctorReady)).toBe(true);
  });

  it("returns false when the app-only lane status is 'missing'", () => {
    expect(appOnlyLaneReady(doctorMissing)).toBe(false);
  });

  it("returns false when the app-only lane is absent entirely", () => {
    expect(appOnlyLaneReady(doctorAbsentLane)).toBe(false);
  });

  it("returns false for a non-object / empty doctor result", () => {
    expect(appOnlyLaneReady(null)).toBe(false);
    expect(appOnlyLaneReady(undefined)).toBe(false);
    expect(appOnlyLaneReady("nope")).toBe(false);
    expect(appOnlyLaneReady({})).toBe(false);
    expect(appOnlyLaneReady({ auth_lanes: {} })).toBe(false);
  });
});

describe("mapTweetsResult", () => {
  it("maps every tweet to an XPostInsert row keyed by (company_id, post_id)", () => {
    const rows = mapTweetsResult(tweetsResult, target);
    expect(rows).toHaveLength(2);

    const first = rows.find((r) => r.post_id === "1801234567890123456")!;
    expect(first.company_id).toBe("co-123");
    expect(first.user_id).toBe("user-456");
    expect(first.subject).toBe("Replit");
    expect(first.text).toBe("Replit Agent now ships full-stack apps.");
    expect(first.author).toBe("replit");
    expect(first.posted_at).toBe("2026-06-28T12:00:00Z");
    expect(first.url).toBe("https://x.com/replit/status/1801234567890123456");
    expect(first.metrics).toEqual({ likes: 1200, reposts: 340, replies: 88 });
    expect(first.source).toBe("x-twitter");
    expect(typeof first.fetched_at).toBe("string");
    expect(Number.isNaN(Date.parse(first.fetched_at as string))).toBe(false);
  });

  it("carries the handle from the result onto every row", () => {
    const rows = mapTweetsResult(tweetsResult, target);
    for (const r of rows) expect(r.handle).toBe("replit");
  });

  it("drops tweets that have no id (post_id is the natural-key anchor; never fabricated)", () => {
    const missingId = {
      tweets: [
        { text: "no id here", author: "replit" },
        { id: "999", text: "has id", author: "replit" },
      ],
    };
    const rows = mapTweetsResult(missingId, target);
    expect(rows).toHaveLength(1);
    expect(rows[0].post_id).toBe("999");
  });

  it("maps absent optional fields to null and never fabricates them", () => {
    const bare = { tweets: [{ id: "42" }] };
    const rows = mapTweetsResult(bare, target);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.post_id).toBe("42");
    expect(r.text).toBeNull();
    expect(r.author).toBeNull();
    expect(r.posted_at).toBeNull();
    expect(r.url).toBeNull();
    expect(r.handle).toBeNull();
    expect(r.metrics).toEqual({});
  });

  it("returns [] for empty / absent / non-object results", () => {
    expect(mapTweetsResult({ tweets: [] }, target)).toEqual([]);
    expect(mapTweetsResult({}, target)).toEqual([]);
    expect(mapTweetsResult(null, target)).toEqual([]);
    expect(mapTweetsResult(undefined, target)).toEqual([]);
  });

  it("accepts a bare tweets array as the result", () => {
    const rows = mapTweetsResult(tweetsResult.tweets, target);
    expect(rows).toHaveLength(2);
    // A bare array has no envelope handle → handle is null.
    for (const r of rows) expect(r.handle).toBeNull();
  });

  it("coerces a numeric tweet id to a string post_id", () => {
    const numericId = { tweets: [{ id: 1801234567890123456, text: "x" }] };
    const rows = mapTweetsResult(numericId, target);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].post_id).toBe("string");
  });
});
