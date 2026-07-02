import { describe, expect, it } from "vitest";
import { AGENT_FLAGS, parseEnvelope, resolveCik } from "@/lib/ingest/cli";

describe("AGENT_FLAGS", () => {
  it("is the five --agent flags in order", () => {
    expect(AGENT_FLAGS).toEqual([
      "--json",
      "--compact",
      "--no-input",
      "--no-color",
      "--yes",
    ]);
  });
});

describe("parseEnvelope", () => {
  it("parses a valid {meta,results} object with an array results", () => {
    const env = parseEnvelope(
      '{"meta":{"count":2},"results":[{"cik":"123"},{"cik":"456"}]}',
    );
    expect(env.ok).toBe(true);
    expect(env.meta).toEqual({ count: 2 });
    expect(env.results).toEqual([{ cik: "123" }, { cik: "456" }]);
    expect(env.error).toBeUndefined();
  });

  it("parses a valid envelope whose results is an object", () => {
    const env = parseEnvelope('{"meta":{},"results":{"cik":"789"}}');
    expect(env.ok).toBe(true);
    expect(env.results).toEqual({ cik: "789" });
  });

  it("extracts the balanced JSON object when wrapped in leading/trailing prose", () => {
    const env = parseEnvelope(
      'Running agent...\n{"meta":{"ok":true},"results":[]}\nDone.\n',
    );
    expect(env.ok).toBe(true);
    expect(env.meta).toEqual({ ok: true });
    expect(env.results).toEqual([]);
  });

  it("handles nested braces and braces inside strings", () => {
    const env = parseEnvelope(
      'noise {"meta":{"note":"a } brace in a string"},"results":{"nested":{"x":1}}} trailing',
    );
    expect(env.ok).toBe(true);
    expect(env.results).toEqual({ nested: { x: 1 } });
  });

  it("returns {ok:false} for an empty string without throwing", () => {
    const env = parseEnvelope("");
    expect(env.ok).toBe(false);
    expect(env.error).toBeTruthy();
  });

  it("returns {ok:false} for non-JSON prose without throwing", () => {
    const env = parseEnvelope("command not found: pp-cli");
    expect(env.ok).toBe(false);
    expect(env.error).toBeTruthy();
  });

  it("returns {ok:false} for valid JSON that is a bare array (not an object)", () => {
    const env = parseEnvelope("[1,2,3]");
    expect(env.ok).toBe(false);
  });

  it("returns {ok:false} for valid JSON that is a bare number", () => {
    const env = parseEnvelope("42");
    expect(env.ok).toBe(false);
  });

  it("returns {ok:false} for a truncated / unbalanced JSON object", () => {
    const env = parseEnvelope('{"meta":{},"results":[');
    expect(env.ok).toBe(false);
  });
});

describe("resolveCik", () => {
  it("returns the single cik unchanged when not ambiguous", () => {
    expect(resolveCik({ cik: "0000320193" })).toBe("0000320193");
  });

  it("returns the single cik when is_ambiguous is explicitly false", () => {
    expect(resolveCik({ is_ambiguous: false, cik: "0000320193" })).toBe(
      "0000320193",
    );
  });

  it("coerces a numeric cik to a string", () => {
    expect(resolveCik({ cik: 320193 })).toBe("320193");
  });

  it("returns ambiguous+candidates when is_ambiguous with cik_summaries", () => {
    const res = resolveCik({
      is_ambiguous: true,
      cik_summaries: [
        { cik: "0000111", name: "Foo Inc" },
        { cik: "0000222", name: "Foo LLC" },
      ],
    });
    expect(res).toEqual({ ambiguous: true, candidates: ["0000111", "0000222"] });
  });

  it("returns ambiguous with empty candidates when cik_summaries is absent", () => {
    expect(resolveCik({ is_ambiguous: true })).toEqual({
      ambiguous: true,
      candidates: [],
    });
  });

  it("returns ambiguous with empty candidates when cik_summaries is empty", () => {
    expect(resolveCik({ is_ambiguous: true, cik_summaries: [] })).toEqual({
      ambiguous: true,
      candidates: [],
    });
  });

  it("treats a result with no cik and not ambiguous as ambiguous+empty (never fabricates)", () => {
    expect(resolveCik({})).toEqual({ ambiguous: true, candidates: [] });
  });
});
