import type { FplEventRef } from "./types";

/**
 * Map a press-conference publication time to the FPL gameweek it relates to.
 * Pre-match pressers usually land in the few days before the GW deadline.
 */
export function gameweekForDate(publishedAt: Date, events: FplEventRef[]): number | null {
  if (!events.length) return null;

  const sorted = [...events].sort((left, right) => left.id - right.id);

  for (const event of sorted) {
    const deadline = new Date(event.deadlineTime);
    const windowStart = new Date(deadline);
    windowStart.setUTCDate(windowStart.getUTCDate() - 4);
    const windowEnd = new Date(deadline);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

    if (publishedAt >= windowStart && publishedAt <= windowEnd) {
      return event.id;
    }
  }

  const upcoming = sorted.find((event) => new Date(event.deadlineTime) >= publishedAt);
  if (upcoming) return upcoming.id;

  return sorted.at(-1)?.id ?? null;
}
