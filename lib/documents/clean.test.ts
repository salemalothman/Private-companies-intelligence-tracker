import { describe, expect, it } from "vitest";
import { cleanPdfText, hasReadableText } from "@/lib/documents/clean";

describe("cleanPdfText", () => {
  it("strips pdf-parse page markers", () => {
    const out = cleanPdfText(
      "-- 1 of 46 -- -- 2 of 46 -- Replit raised a $400 million Series D.",
    );
    expect(out).not.toMatch(/of 46/);
    expect(out).toContain("Replit raised a $400 million Series D.");
  });

  it("rejoins words hyphenated across a line break", () => {
    expect(cleanPdfText("a $9 billion valu-\nation led by Georgian")).toContain(
      "valuation led by Georgian",
    );
  });

  it("drops lone page numbers and symbol soup", () => {
    const out = cleanPdfText("46\n<<<<<< D gO\nReplit hit a $9 billion valuation.");
    expect(out).not.toMatch(/^46$/m);
    expect(out).not.toContain("<<<<<<");
    expect(out).toContain("Replit hit a $9 billion valuation.");
  });

  it("preserves coherent paragraphs and collapses blank runs", () => {
    const out = cleanPdfText("First sentence here.\n\n\n\nSecond paragraph here.");
    expect(out).toBe("First sentence here.\n\nSecond paragraph here.");
  });

  it("returns empty string for empty input", () => {
    expect(cleanPdfText("")).toBe("");
  });
});

describe("hasReadableText", () => {
  it("rejects image-deck fragment noise", () => {
    // The Replit deck case: a handful of scattered glyph fragments.
    expect(hasReadableText("an ople des es Jni UBI wit II ilow ure Case alu")).toBe(
      false,
    );
  });

  it("accepts a real paragraph of prose", () => {
    expect(
      hasReadableText(
        "Replit announced that it raised a 400 million dollar Series D round at a " +
          "nine billion dollar valuation led by Georgian Partners with participation " +
          "from Coatue, Andreessen Horowitz, and Y Combinator continuing their support.",
      ),
    ).toBe(true);
  });
});
