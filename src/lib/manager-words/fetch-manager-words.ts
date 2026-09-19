import type { FplEventRef, FplTeamRef, ManagerWordsFetchResult } from "./types";
import { fetchBbcManagerWords } from "./bbc-fetcher";

const FPL_API = "https://fantasy.premierleague.com/api";

type BootstrapStatic = {
  teams: Array<{ id: number; name: string; short_name: string }>;
  events: Array<{
    id: number;
    name: string;
    deadline_time: string;
    finished: boolean;
  }>;
};

function seasonCode(date = new Date()) {
  const startYear = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

async function fetchBootstrap(): Promise<{ season: string; teams: FplTeamRef[]; events: FplEventRef[] }> {
  const response = await fetch(`${FPL_API}/bootstrap-static/`, {
    headers: { Accept: "application/json", "User-Agent": "fpl-formula-manager-words/0.1" },
  });

  if (!response.ok) {
    throw new Error(`${response.status} while fetching FPL bootstrap-static`);
  }

  const bootstrap = (await response.json()) as BootstrapStatic;

  return {
    season: seasonCode(),
    teams: bootstrap.teams.map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
    })),
    events: bootstrap.events.map((event) => ({
      id: event.id,
      name: event.name,
      deadlineTime: event.deadline_time,
      finished: event.finished,
    })),
  };
}

export async function fetchManagerWords(): Promise<ManagerWordsFetchResult> {
  const fetchedAt = new Date().toISOString();
  const { season, teams, events } = await fetchBootstrap();
  const { items, stats } = await fetchBbcManagerWords({ season, teams, events, fetchedAt });

  return {
    season,
    fetchedAt,
    items,
    sources: stats,
  };
}
