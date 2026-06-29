/**
 * Chronological partitioning for the events calendar.
 *
 * Fixes the temporal bug where past-dated records (e.g. a funding round from
 * 2025) were rendered under "Upcoming events". An event is upcoming only when
 * it has a real date on or after today; everything else — past dates and
 * undated records — routes to the historical timeline. ISO date strings
 * (YYYY-MM-DD) compare correctly lexicographically.
 */

export interface DatedEvent {
  event_date: string | null;
}

/** True only for events with a concrete date today or later. */
export function isUpcoming(eventDate: string | null, today: string): boolean {
  return eventDate != null && eventDate.slice(0, 10) >= today.slice(0, 10);
}

export function partitionEvents<T extends DatedEvent>(
  events: T[],
  today: string,
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const e of events) {
    (isUpcoming(e.event_date, today) ? upcoming : past).push(e);
  }
  // Upcoming: soonest first. Past: most recent first (undated last).
  upcoming.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
  past.sort((a, b) => (b.event_date ?? "").localeCompare(a.event_date ?? ""));
  return { upcoming, past };
}
