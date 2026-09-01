import { describe, expect, it } from "vitest";
import { buildPlayerHighlights } from "../src/lib/player-highlights";
import type { RankedPlayer, RankingResponse } from "../src/lib/fpl-types";

function player(playerId: number, score: number, minutes = 90): RankedPlayer {
  return {
    playerId,
    name: `Player ${playerId}`,
    team: "Example FC",
    teamShortName: "EFC",
    position: "MID",
    cost: 7,
    status: "a",
    chanceOfPlaying: null,
    minutes,
    formPoints: score,
    xg: 0,
    xa: 0,
    defcon: 0,
    lastSeasonPointsPer90: 0,
    lastSeasonXgiPer90: 0,
    teamAttack: 0,
    teamDefence: 0,
    fixtures: [],
    rank: playerId,
    score,
    breakdown: { individual: 0, team: 0, fixtures: 0, venue: 0 },
  };
}

describe("buildPlayerHighlights", () => {
  it("uses the six best active players and labels each recent-points direction", () => {
    const rankings: RankingResponse = {
      season: "2026-27",
      currentGameweek: 5,
      syncedAt: "2026-09-01T00:00:00.000Z",
      availableTeams: ["Example FC"],
      rankings: [
        player(1, 96),
        player(2, 95),
        player(3, 94),
        player(4, 93),
        player(5, 92),
        player(6, 91),
        player(7, 90),
        player(8, 89, 0),
      ],
    };

    const result = buildPlayerHighlights(rankings, [
      { player_id: 1, event: 1, points: 1 },
      { player_id: 1, event: 2, points: 1 },
      { player_id: 1, event: 3, points: 1 },
      { player_id: 1, event: 4, points: 1 },
      { player_id: 1, event: 5, points: 7 },
      { player_id: 2, event: 1, points: 5 },
      { player_id: 2, event: 2, points: 5 },
      { player_id: 2, event: 3, points: 5 },
      { player_id: 2, event: 4, points: 5 },
      { player_id: 2, event: 5, points: 1 },
    ]);

    expect(result.gameweeks).toEqual([1, 2, 3, 4, 5]);
    expect(result.highlights).toHaveLength(6);
    expect(result.highlights[0]).toMatchObject({
      playerId: 1,
      recentPoints: [1, 1, 1, 1, 7],
      trend: "rising",
      trendDelta: 6,
    });
    expect(result.highlights[1]).toMatchObject({ playerId: 2, trend: "falling", trendDelta: -4 });
  });

  it("returns an empty state before a completed Gameweek exists", () => {
    expect(buildPlayerHighlights({
      season: "2026-27",
      currentGameweek: 0,
      syncedAt: "2026-09-01T00:00:00.000Z",
      availableTeams: [],
      rankings: [],
    }, [])).toEqual({
      season: "2026-27",
      currentGameweek: 0,
      gameweeks: [],
      highlights: [],
    });
  });
});
