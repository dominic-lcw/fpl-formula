import type { Position, RankingParams, RankingResponse } from "@/lib/fpl-types";
import { DEFAULT_PARAMS, sanitiseParams } from "@/lib/scoring";

export type RankedPlayerSuggestion = {
  playerId: number;
  rank: number;
  player: string;
  club: string;
  position: Position;
  score: number;
};

export type DashboardRankingData = RankingResponse & {
  count: number;
};

function buildSearchParams(
  params: RankingParams,
  options: {
    position?: Position | "ALL";
    team?: string;
    liveGameweek?: number | null;
  } = {},
) {
  const safeParams = sanitiseParams(params);
  const searchParams = new URLSearchParams({
    formWindow: String(safeParams.formWindow),
    fixtureHorizon: String(safeParams.fixtureHorizon),
    minMinutes: String(safeParams.minMinutes),
    individual: String(safeParams.weights.individual),
    teamWeight: String(safeParams.weights.team),
    fixtures: String(safeParams.weights.fixtures),
  });
  if (options.position && options.position !== "ALL") {
    searchParams.set("position", options.position);
  }
  if (options.team && options.team !== "ALL") {
    searchParams.set("club", options.team);
  }
  if (Number.isInteger(options.liveGameweek) && options.liveGameweek && options.liveGameweek > 0) {
    searchParams.set("liveGameweek", String(options.liveGameweek));
  }
  return searchParams;
}

export async function fetchRankings(
  params: RankingParams = DEFAULT_PARAMS,
  options: {
    position?: Position | "ALL";
    team?: string;
    liveGameweek?: number | null;
  } = {},
): Promise<DashboardRankingData> {
  const response = await fetch(`/api/rankings?${buildSearchParams(params, options).toString()}`, {
    cache: "no-store",
  });
  const payload = await response.json() as RankingResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load rankings.");
  }
  return {
    ...payload,
    count: payload.rankings.length,
  };
}

export function searchRankedPlayers(
  rankings: RankingResponse["rankings"],
  searchTerm: string,
): RankedPlayerSuggestion[] {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return [];

  return rankings
    .filter((player) => player.name.toLowerCase().includes(term))
    .sort((left, right) => {
      const leftName = left.name.toLowerCase();
      const rightName = right.name.toLowerCase();
      const leftRank = leftName === term ? 0 : leftName.startsWith(term) ? 1 : 2;
      const rightRank = rightName === term ? 0 : rightName.startsWith(term) ? 1 : 2;
      return leftRank - rightRank || left.rank - right.rank;
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

export function getPinnedPlayerRank(
  rankings: RankingResponse["rankings"],
  playerId: number,
) {
  const player = rankings.find((entry) => entry.playerId === playerId);
  if (!player) return null;
  return {
    playerId: player.playerId,
    rank: player.rank,
    score: player.score,
    player: player.name,
    club: player.teamShortName,
    position: player.position,
  };
}
