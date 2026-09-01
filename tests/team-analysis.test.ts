import { describe, expect, it } from "vitest";
import type { RankedPlayer, RankingResponse } from "../src/lib/fpl-types";
import { buildTeamAnalysis } from "../src/lib/team-analysis";

function player(id: number, position: RankedPlayer["position"], score: number): RankedPlayer {
  return {
    playerId: id,
    name: `Player ${id}`,
    team: "Example",
    teamShortName: "EXA",
    position,
    cost: 6,
    status: "a",
    chanceOfPlaying: 100,
    minutes: 500,
    formPoints: 20,
    xg: 1,
    xa: 1,
    defcon: 10,
    lastSeasonPointsPer90: 5,
    lastSeasonXgiPer90: 0.4,
    teamAttack: 4,
    teamDefence: 4,
    fixtures: [],
    rank: id,
    score,
    breakdown: { individual: score, team: score, fixtures: score },
  };
}

const rankingData: RankingResponse = {
  season: "2025-26",
  currentGameweek: 10,
  syncedAt: null,
  availableTeams: ["Example"],
  rankings: [
    player(1, "GKP", 50), player(2, "GKP", 70), player(3, "DEF", 51), player(4, "DEF", 71),
    player(5, "MID", 52), player(6, "MID", 72), player(7, "FWD", 53), player(8, "FWD", 73),
  ],
};

describe("buildTeamAnalysis", () => {
  it("scores selected squad members and excludes them from recommendations", () => {
    const analysis = buildTeamAnalysis(rankingData, [
      { element: 1, is_captain: true, is_vice_captain: false, multiplier: 2 },
      { element: 3, is_captain: false, is_vice_captain: true, multiplier: 1 },
    ]);

    expect(analysis.averageScore).toBe(50.5);
    expect(analysis.members.map((member) => member.playerId)).toEqual([3, 1]);
    expect(analysis.members[1].isCaptain).toBe(true);
    expect(analysis.suggestions.GKP.map((member) => member.playerId)).toEqual([2]);
    expect(analysis.suggestions.DEF.map((member) => member.playerId)).toEqual([4]);
  });
});
