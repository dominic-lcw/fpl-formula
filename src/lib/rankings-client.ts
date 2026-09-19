import type { Position, RankedPlayer, RankingParams, RankingResponse } from "@/lib/fpl-types";

export type RankedPlayerSuggestion = {
  playerId: number;
  rank: number;
  player: string;
  club: string;
  position: Position;
  score: number;
};

export type PinnedPlayerRank = RankedPlayerSuggestion;

export function rankingsSearchParams(
  params: RankingParams,
  options: { liveGameweek?: number | null } = {},
) {
  const search = new URLSearchParams({
    formWindow: String(params.formWindow),
    fixtureHorizon: String(params.fixtureHorizon),
    minMinutes: String(params.minMinutes),
    individual: String(params.weights.individual),
    team: String(params.weights.team),
    fixtures: String(params.weights.fixtures),
  });
  if (options.liveGameweek) {
    search.set("liveGameweek", String(options.liveGameweek));
  }
  return search;
}

export async function fetchRankings(
  params: RankingParams,
  options: { liveGameweek?: number | null; cache?: RequestCache } = {},
): Promise<RankingResponse> {
  const search = rankingsSearchParams(params, options);
  const response = await fetch(`/api/rankings?${search}`, { cache: options.cache ?? "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Unable to load rankings.");
  }
  return response.json() as Promise<RankingResponse>;
}

export function filterRankings(
  rankings: RankedPlayer[],
  position: Position | "ALL",
  team: string,
) {
  return rankings.filter((player) => {
    if (position !== "ALL" && player.position !== position) return false;
    if (team !== "ALL" && player.team !== team) return false;
    return true;
  });
}

export function searchRankings(rankings: RankedPlayer[], term: string): RankedPlayerSuggestion[] {
  const query = term.trim().toLowerCase();
  if (!query) return [];

  return rankings
    .filter((player) => player.name.toLowerCase().includes(query))
    .sort((left, right) => {
      const leftName = left.name.toLowerCase();
      const rightName = right.name.toLowerCase();
      const leftPriority = leftName === query ? 0 : leftName.startsWith(query) ? 1 : 2;
      const rightPriority = rightName === query ? 0 : rightName.startsWith(query) ? 1 : 2;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return left.rank - right.rank;
    })
    .slice(0, 8)
    .map((player) => ({
      playerId: player.playerId,
      rank: player.rank,
      player: player.name,
      club: player.teamShortName,
      position: player.position,
      score: player.score,
    }));
}

export function getPinnedPlayerRank(rankings: RankedPlayer[], playerId: number): PinnedPlayerRank | null {
  if (!Number.isInteger(playerId) || playerId <= 0) return null;

  const player = rankings.find((entry) => entry.playerId === playerId);
  if (!player) return null;

  return {
    playerId: player.playerId,
    rank: player.rank,
    player: player.name,
    club: player.teamShortName,
    position: player.position,
    score: player.score,
  };
}

export function formatNextFixtures(player: RankedPlayer) {
  if (!player.fixtures.length) return "—";
  return player.fixtures
    .map((fixture) => `${fixture.opponent.slice(0, 3).toUpperCase()} ${fixture.wasHome ? "H" : "A"}`)
    .join(" · ");
}
