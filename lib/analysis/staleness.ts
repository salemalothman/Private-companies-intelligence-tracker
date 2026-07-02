/**
 * Staleness helper for the deep-dive analysis layer (FND-06).
 *
 * `isStale` drives the "may be stale" hint: it reports whether the underlying
 * data a stored analysis was generated from (valuations, competitors, …) has
 * changed AFTER the analysis's `generated_at`. It is observational only — it
 * never mutates or re-generates anything, and it deliberately defaults to
 * NOT-stale whenever inputs are missing or unparseable so the UI errs toward
 * a quiet state (no analysis yet → empty state, not a false "stale" warning).
 */

/** Parse an ISO string or Date into epoch ms, or null when not a valid date. */
function toEpoch(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * True only when both timestamps parse AND the underlying data changed strictly
 * after the analysis was generated (`latestDataChange > generatedAt`). Returns
 * false for missing/equal/earlier/unparseable inputs.
 */
export function isStale(
  generatedAt: string | Date | null | undefined,
  latestDataChange: string | Date | null | undefined,
): boolean {
  const generated = toEpoch(generatedAt);
  const changed = toEpoch(latestDataChange);
  if (generated === null || changed === null) return false;
  return changed > generated;
}
