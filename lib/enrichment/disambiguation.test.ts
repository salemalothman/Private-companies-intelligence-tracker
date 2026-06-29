import { describe, expect, it } from "vitest";
import { wrongEntitySignal } from "@/lib/enrichment/disambiguation";

describe("wrongEntitySignal — Accrete AI vs Accrete Inc (TYO:4395)", () => {
  it("blocks the Japanese public ticker collision", () => {
    expect(wrongEntitySignal("Accrete Ai", "Accrete Inc. (4395.T) closing price on Tokyo Stock Exchange").blocked).toBe(true);
    expect(wrongEntitySignal("Accrete Ai", "TYO: 4395 stock quote up 3%").blocked).toBe(true);
    expect(wrongEntitySignal("Accrete Ai", "アクリート shares").blocked).toBe(true);
  });
  it("blocks Yahoo Finance stock alerts on the private company", () => {
    const r = wrongEntitySignal("Accrete Ai", "Yahoo Finance: 4395.T share price alert");
    expect(r.blocked).toBe(true);
  });
  it("allows genuine private-company AI signals", () => {
    expect(wrongEntitySignal("Accrete Ai", "Accrete AI wins DoD STRATFI award for autonomous agents").blocked).toBe(false);
    expect(wrongEntitySignal("Accrete Ai", "Accrete raises Series C for enterprise AI knowledge engines").blocked).toBe(false);
  });
  it("does not over-block companies without a collision rule", () => {
    expect(wrongEntitySignal("Replit", "Replit launches a new agent feature").blocked).toBe(false);
  });
  it("flags generic public-equity noise on any private company", () => {
    expect(wrongEntitySignal("moove io", "Moove stock price ticker on NASDAQ trading at $40 per share on the nasdaq").blocked).toBe(true);
  });
});
