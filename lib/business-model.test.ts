import { describe, expect, it } from "vitest";
import { businessModelMix } from "@/lib/business-model";

const co = (p: { name?: string; sector?: string | null; description?: string | null }) => ({
  name: p.name ?? "Acme",
  sector: p.sector ?? null,
  description: p.description ?? null,
});

describe("businessModelMix", () => {
  it("always returns four segments summing to exactly 100", () => {
    for (const c of [
      co({ sector: "AI", description: "developer platform and IDE" }),
      co({ sector: "GovTech", description: "federal defense agency contracts" }),
      co({ name: "Mystery", sector: null, description: null }),
      co({ sector: "Consulting", description: "professional services and integration" }),
    ]) {
      const mix = businessModelMix(c);
      expect(mix).toHaveLength(4);
      expect(mix.reduce((s, m) => s + m.pct, 0)).toBe(100);
      expect(mix.every((m) => m.pct >= 0)).toBe(true);
    }
  });

  it("weights enterprise SaaS highest for a developer-platform profile", () => {
    const mix = businessModelMix(
      co({ sector: "AI", description: "B2B SaaS developer platform / cloud IDE" }),
    );
    const top = [...mix].sort((a, b) => b.pct - a.pct)[0];
    expect(top.key).toBe("enterprise");
  });

  it("surfaces government for public-sector profiles", () => {
    const mix = businessModelMix(
      co({ sector: "GovTech", description: "federal defense and agency procurement" }),
    );
    const gov = mix.find((m) => m.key === "government")!;
    expect(gov.pct).toBeGreaterThan(25);
  });

  it("is deterministic for the same profile", () => {
    const c = co({ sector: "Fintech", description: "consumer subscription app" });
    expect(businessModelMix(c)).toEqual(businessModelMix(c));
  });
});
