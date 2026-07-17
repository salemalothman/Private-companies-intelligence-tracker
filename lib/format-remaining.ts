/**
 * Pure estimated-time-remaining formatter for long-running actions.
 *
 * Non-positive input (elapsed has met or passed the estimate) returns the
 * literal "wrapping up…" so the UI degrades honestly on overrun instead of
 * freezing at ~0s or a fake 99%. Dependency-free so it stays unit-testable and
 * safe to import into both client components and tests.
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "wrapping up…";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 1) return `~${seconds}s left`;
  return `~${minutes}m ${seconds}s left`;
}
