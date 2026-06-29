import { describe, expect, it } from "vitest";
import {
  isGenericSource,
  isTrustedOutlet,
  resolvePrimarySource,
  sourceDomain,
} from "@/lib/enrichment/sanitize-sources";

describe("isGenericSource", () => {
  it("flags tool/aggregator/LLM labels", () => {
    for (const s of ["exa", "Exa", "grok:x", "grok:x:social", "Perplexity", "x-search", ""])
      expect(isGenericSource(s)).toBe(true);
  });
  it("keeps real publishers", () => {
    for (const s of ["bloomberg.com", "SEC EDGAR (Form D)", "AG Dillon", "@AccreteAI (X)", "pdf:Deck.pdf"])
      expect(isGenericSource(s)).toBe(false);
  });
});

describe("resolvePrimarySource", () => {
  it("resolves a generic label to the article's publisher domain", () => {
    expect(resolvePrimarySource({ source: "exa", url: "https://www.bloomberg.com/news/x" })).toBe("bloomberg.com");
    expect(resolvePrimarySource({ source: "grok:x", url: "https://techcrunch.com/2026/03/11/replit" })).toBe("techcrunch.com");
  });
  it("extracts the exact X handle when no URL exists", () => {
    expect(resolvePrimarySource({ source: "grok:x:social (@AccreteAI)" })).toBe("@AccreteAI (X)");
  });
  it("returns null when a generic label cannot be resolved", () => {
    expect(resolvePrimarySource({ source: "exa" })).toBeNull();
    expect(resolvePrimarySource({ source: "grok:x", url: null })).toBeNull();
  });
  it("passes already-clean sources through unchanged", () => {
    expect(resolvePrimarySource({ source: "bloomberg.com" })).toBe("bloomberg.com");
    expect(resolvePrimarySource({ source: "SEC EDGAR (Form D)" })).toBe("SEC EDGAR (Form D)");
  });
});

describe("trusted outlets + domain", () => {
  it("recognizes tier-1 outlets and parses domains", () => {
    expect(sourceDomain("https://www.wsj.com/articles/abc")).toBe("wsj.com");
    expect(isTrustedOutlet("bloomberg.com")).toBe(true);
    expect(isTrustedOutlet("randomblog.xyz")).toBe(false);
  });
});
