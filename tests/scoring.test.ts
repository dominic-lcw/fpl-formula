import { describe, expect, it } from "vitest";
import type { PlayerFeature } from "../src/lib/fpl-types";
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
  defcon: 20,
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

  it("folds a legacy venue weight into fixtures", () => {
    expect(
      sanitiseParams({
        weights: { individual: 45, team: 20, fixtures: 25, venue: 10 },
      }).weights,
    ).toEqual({ individual: 45, team: 20, fixtures: 35 });
  });
});
