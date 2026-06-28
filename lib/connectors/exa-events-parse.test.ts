import { describe, expect, it } from "vitest";
import {
  classifyEvent,
  parseEventDate,
  parseSharePrice,
} from "@/lib/connectors/exa-events-parse";

describe("parseEventDate", () => {
  it("parses month-name, ISO, quarter, and month-year forms", () => {
    expect(parseEventDate("Demo Day is on July 15, 2026 in SF")).toBe("2026-07-15");
    expect(parseEventDate("event 2026-09-01 keynote")).toBe("2026-09-01");
    expect(parseEventDate("earnings in Q3 2026")).toBe("2026-07-01");
    expect(parseEventDate("launching September 2026")).toBe("2026-09-01");
    expect(parseEventDate("15th August 2026")).toBe("2026-08-15");
  });
  it("returns null when no date is present", () => {
    expect(parseEventDate("no date here")).toBeNull();
  });
});

describe("parseSharePrice", () => {
  it("extracts a per-share price", () => {
    expect(parseSharePrice("trading at $58.50 per share")).toBe(58.5);
    expect(parseSharePrice("$120/share on Forge")).toBe(120);
  });
  it("returns undefined without a per-share figure", () => {
    expect(parseSharePrice("$2B valuation")).toBeUndefined();
  });
});

describe("classifyEvent", () => {
  it("buckets secondary, valuation, and corporate", () => {
    expect(classifyEvent("secondary shares at $50 per share")).toBe("secondary");
    expect(classifyEvent("raises $200M at $3B valuation")).toBe("valuation");
    expect(classifyEvent("annual developer conference keynote")).toBe("corporate");
  });
});
