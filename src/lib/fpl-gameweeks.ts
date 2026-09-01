export type FplEvent = {
  id: number;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
};

export type LiveGameweekStatus = {
  currentGameweek: number;
  currentGameweekStatus: "complete" | "in_progress" | "upcoming";
  latestFinishedGameweek: number;
};

export function summarizeGameweeks(events: FplEvent[]): LiveGameweekStatus | null {
  if (!events.length) return null;

  const latestFinishedGameweek = Math.max(
    0,
    ...events.filter((event) => event.finished).map((event) => event.id),
  );
  const currentEvent = events.find((event) => event.is_current);
  if (currentEvent) {
    return {
      currentGameweek: currentEvent.id,
      currentGameweekStatus: currentEvent.finished ? "complete" : "in_progress",
      latestFinishedGameweek,
    };
  }

  const nextEvent = events.find((event) => event.is_next);
  if (nextEvent) {
    return {
      currentGameweek: nextEvent.id,
      currentGameweekStatus: "upcoming",
      latestFinishedGameweek,
    };
  }

  return {
    currentGameweek: latestFinishedGameweek,
    currentGameweekStatus: "complete",
    latestFinishedGameweek,
  };
}
