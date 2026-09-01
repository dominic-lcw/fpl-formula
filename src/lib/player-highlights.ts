import { query } from "@/lib/db";
import type { RankedPlayer, RankingResponse } from "@/lib/fpl-types";
import { DEFAULT_PARAMS } from "@/lib/scoring";
import { getRankingData } from "@/lib/rankings";

type PlayerGameweekRow = {
  player_id: number;
  event: number;
  points: number | null;
};

export type PlayerHighlight = Pick<
  RankedPlayer,
  "playerId" | "name" | "teamShortName" | "position" | "rank" | "score" | "formPoints" | "fixtures"
> & {
  recentPoints: number[];
  trendDelta: number;
  trend: "rising" | "steady" | "falling";
};

export type PlayerHighlightsResponse = {
  season: string | null;
  currentGameweek: number | null;
  gameweeks: number[];
  highlights: PlayerHighlight[];
};

export type PlayerHighlightResponse = Omit<PlayerHighlightsResponse, "highlights"> & {
  highlight: PlayerHighlight | null;
};

function round(value: number) {
  return Number(value.toFixed(1));
}

export function buildPlayerHighlights(
  rankings: RankingResponse,
  rows: PlayerGameweekRow[],
): PlayerHighlightsResponse {
  const currentGameweek = rankings.currentGameweek;
  if (!rankings.season || !currentGameweek) {
    return { season: rankings.season, currentGameweek, gameweeks: [], highlights: [] };
  }

  const gameweeks = Array.from(
    { length: Math.min(DEFAULT_PARAMS.formWindow, currentGameweek) },
    (_, index) => currentGameweek - Math.min(DEFAULT_PARAMS.formWindow, currentGameweek) + index + 1,
  );
  const pointsByPlayer = new Map<number, Map<number, number>>();
  for (const row of rows) {
    const playerPoints = pointsByPlayer.get(row.player_id) ?? new Map<number, number>();
    playerPoints.set(row.event, Number(row.points ?? 0));
    pointsByPlayer.set(row.player_id, playerPoints);
  }

  const highlights = rankings.rankings
    .filter((player) => player.minutes > 0)
    .slice(0, 6)
    .map((player) => {
      const recentPoints = gameweeks.map((gameweek) => pointsByPlayer.get(player.playerId)?.get(gameweek) ?? 0);
      const earlierPoints = recentPoints.slice(0, -1);
      const earlierAverage = earlierPoints.length
        ? earlierPoints.reduce((total, points) => total + points, 0) / earlierPoints.length
        : recentPoints[0] ?? 0;
      const trendDelta = round((recentPoints.at(-1) ?? 0) - earlierAverage);
      const trend: PlayerHighlight["trend"] =
        trendDelta > 1 ? "rising" : trendDelta < -1 ? "falling" : "steady";

      return {
        playerId: player.playerId,
        name: player.name,
        teamShortName: player.teamShortName,
        position: player.position,
        rank: player.rank,
        score: player.score,
        formPoints: player.formPoints,
        fixtures: player.fixtures,
        recentPoints,
        trendDelta,
        trend,
      };
    });

  return { season: rankings.season, currentGameweek, gameweeks, highlights };
}

export async function getPlayerHighlights(): Promise<PlayerHighlightsResponse> {
  const rankings = await getRankingData(DEFAULT_PARAMS);
  if (!rankings.season || !rankings.currentGameweek) {
    return buildPlayerHighlights(rankings, []);
  }

  const startGameweek = Math.max(1, rankings.currentGameweek - DEFAULT_PARAMS.formWindow + 1);
  const rows = await query<PlayerGameweekRow>(
    `SELECT player_id, event, sum(total_points) AS points
     FROM player_fixture_stats
     WHERE season = ? AND event BETWEEN ? AND ?
     GROUP BY player_id, event`,
    [rankings.season, startGameweek, rankings.currentGameweek],
  );

  return buildPlayerHighlights(rankings, rows);
}

export async function getPlayerHighlight(playerId: number): Promise<PlayerHighlightResponse> {
  const rankings = await getRankingData(DEFAULT_PARAMS);
  const player = rankings.rankings.find((entry) => entry.playerId === playerId);
  if (!player || !rankings.season || !rankings.currentGameweek) {
    return {
      season: rankings.season,
      currentGameweek: rankings.currentGameweek,
      gameweeks: [],
      highlight: null,
    };
  }

  const startGameweek = Math.max(1, rankings.currentGameweek - DEFAULT_PARAMS.formWindow + 1);
  const rows = await query<PlayerGameweekRow>(
    `SELECT player_id, event, sum(total_points) AS points
     FROM player_fixture_stats
     WHERE season = ? AND player_id = ? AND event BETWEEN ? AND ?
     GROUP BY player_id, event`,
    [rankings.season, playerId, startGameweek, rankings.currentGameweek],
  );
  const result = buildPlayerHighlights({ ...rankings, rankings: [player] }, rows);

  return {
    season: result.season,
    currentGameweek: result.currentGameweek,
    gameweeks: result.gameweeks,
    highlight: result.highlights[0] ?? null,
  };
}
