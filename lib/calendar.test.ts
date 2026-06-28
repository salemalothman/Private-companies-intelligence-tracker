import { describe, expect, it } from "vitest";
import { isUpcoming, partitionEvents } from "@/lib/calendar";

const TODAY = "2026-06-28";

describe("isUpcoming", () => {
  it("treats past dates as not upcoming (the temporal bug)", () => {
    expect(isUpcoming("2025-09-21", TODAY)).toBe(false);
  });
  it("treats today and future dates as upcoming", () => {
    expect(isUpcoming("2026-06-28", TODAY)).toBe(true);
    expect(isUpcoming("2026-07-15", TODAY)).toBe(true);
  });
  it("treats undated records as not upcoming", () => {
    expect(isUpcoming(null, TODAY)).toBe(false);
  });
});

describe("partitionEvents", () => {
  it("routes historical records to past and only true future to upcoming", () => {
    const { upcoming, past } = partitionEvents(
      [
        { event_date: "2025-09-21", title: "old round" },
        { event_date: "2026-07-15", title: "demo day" },
        { event_date: "2026-09-01", title: "earnings" },
        { event_date: null, title: "undated" },
      ],
      TODAY,
    );
    expect(upcoming.map((e) => e.title)).toEqual(["demo day", "earnings"]); // ascending
    expect(past.map((e) => e.title)).toEqual(["old round", "undated"]); // recent first, undated last
  });
});
