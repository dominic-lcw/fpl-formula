import { describe, expect, it } from "vitest";
import type { PlayerFeature } from "../src/lib/fpl-types";
import { individualRaw } from "../src/lib/formula";
import { DEFAULT_PARAMS, sanitiseParams, scorePlayers } from "../src/lib/scoring";

const basePlayer: PlayerFeature = {
  playerId: 1,
  name: "Fixture Player",
  team: "Arsenal",
  teamShortName: "ARS",
  position: "MID",
  cost: 8,
  status: "a",
  chanceOfPlaying: 100,
  minutes: 450,
  formPoints: 28,
  xg: 2.5,
  xa: 1.8,
  attackCon: 140,
  defcon: 20,
  bonusPoints: 3,
  lastSeasonPointsPer90: 5.8,
  lastSeasonXgiPer90: 0.54,
  teamAttack: 8,
  teamDefence: 5,
  fixtures: [{ event: 5, opponent: "Leeds", difficulty: 2, wasHome: true, kickoffTime: null }],
};

describe("scorePlayers", () => {
  it("rewards stronger form and easier fixtures", () => {
    const weaker = {
      ...basePlayer,
      playerId: 2,
      name: "Tough Fixture",
      xg: 0.3,
      xa: 0.1,
      formPoints: 4,
      fixtures: [{ event: 5, opponent: "Liverpool", difficulty: 5, wasHome: false, kickoffTime: null }],
    };
    const rankings = scorePlayers([weaker, basePlayer], { ...DEFAULT_PARAMS, minMinutes: 0 });
    expect(rankings[0].name).toBe("Fixture Player");
    expect(rankings[0].score).toBeGreaterThan(rankings[1].score);
  });

  it("includes home advantage in the fixture component", () => {
    const away = {
      ...basePlayer,
      playerId: 2,
      name: "Away Fixture",
      fixtures: [{ event: 5, opponent: "Leeds", difficulty: 3, wasHome: false, kickoffTime: null }],
    };
    const rankings = scorePlayers([away, basePlayer], {
      ...DEFAULT_PARAMS,
      weights: { individual: 0, team: 0, fixtures: 100 },
    });

    expect(rankings[0].name).toBe("Fixture Player");
    expect(rankings[0].breakdown.fixtures).toBeGreaterThan(rankings[1].breakdown.fixtures);
  });

  it("keeps blanks and low-minute players from being misleading", () => {
    const lowMinutes = { ...basePlayer, playerId: 2, minutes: 40, fixtures: [] };
    const rankings = scorePlayers([basePlayer, lowMinutes], { ...DEFAULT_PARAMS, minMinutes: 180 });
    expect(rankings).toHaveLength(1);
    expect(rankings[0].fixtures).toHaveLength(1);
  });

  it("clamps externally supplied ranking parameters", () => {
    expect(sanitiseParams({ formWindow: 99, fixtureHorizon: -1, minMinutes: -10 }).formWindow).toBe(10);
    expect(sanitiseParams({ formWindow: 99, fixtureHorizon: -1, minMinutes: -10 }).fixtureHorizon).toBe(1);
    expect(sanitiseParams({ formWindow: 99, fixtureHorizon: -1, minMinutes: -10 }).minMinutes).toBe(0);
  });

  it("keeps identical players level across positions", () => {
    const defender = { ...basePlayer, playerId: 1, name: "Same DEF", position: "DEF" as const };
    const forward = { ...basePlayer, playerId: 2, name: "Same FWD", position: "FWD" as const };
    const quiet = {
      ...basePlayer,
      playerId: 3,
      name: "Quiet",
      xg: 0,
      xa: 0,
      attackCon: 0,
      defcon: 0,
      bonusPoints: 0,
      formPoints: 0,
      lastSeasonPointsPer90: 0,
      lastSeasonXgiPer90: 0,
    };

    expect(individualRaw(defender)).toBe(individualRaw(forward));
    const rankings = scorePlayers([defender, forward, quiet], {
      ...DEFAULT_PARAMS,
      weights: { individual: 100, team: 0, fixtures: 0 },
    });
    const rankedDefender = rankings.find((player) => player.name === "Same DEF");
    const rankedForward = rankings.find((player) => player.name === "Same FWD");
    expect(rankedDefender?.score).toBe(rankedForward?.score);
  });

  it("ranks a productive forward ahead of a high-volume defender", () => {
    const defender = {
      ...basePlayer,
      playerId: 1,
      name: "Blocker",
      position: "DEF" as const,
      formPoints: 18,
      xg: 0.1,
      xa: 0.05,
      attackCon: 25,
      defcon: 110,
      bonusPoints: 0,
    };
    const forward = {
      ...basePlayer,
      playerId: 2,
      name: "Finisher",
      position: "FWD" as const,
      formPoints: 28,
      xg: 2.4,
      xa: 0.6,
      attackCon: 260,
      defcon: 8,
      bonusPoints: 3,
    };

    const rankings = scorePlayers([defender, forward], {
      ...DEFAULT_PARAMS,
      weights: { individual: 100, team: 0, fixtures: 0 },
    });

    expect(individualRaw(forward)).toBeGreaterThan(individualRaw(defender));
    expect(rankings[0].name).toBe("Finisher");
  });

  it("adds the 3-point match bonus on top of otherwise equal players", () => {
    const awarded = { ...basePlayer, playerId: 1, name: "Awarded", bonusPoints: 3 };
    const passedOver = { ...basePlayer, playerId: 2, name: "Passed over", bonusPoints: 0 };

    expect(individualRaw(awarded) - individualRaw(passedOver)).toBe(3);
    const rankings = scorePlayers([passedOver, awarded], {
      ...DEFAULT_PARAMS,
      weights: { individual: 100, team: 0, fixtures: 0 },
    });
    expect(rankings[0].name).toBe("Awarded");
  });

  it("folds a legacy venue weight into fixtures", () => {
    expect(
      sanitiseParams({
        weights: { individual: 45, team: 20, fixtures: 25, venue: 10 },
      }).weights,
    ).toEqual({ individual: 45, team: 20, fixtures: 35 });
  });
});
