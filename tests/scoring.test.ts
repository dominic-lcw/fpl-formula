import { describe, expect, it } from "vitest";
import type { PlayerFeature } from "../src/lib/fpl-types";
import { fixtureRaw, individualRaw } from "../src/lib/formula";
import { DEFAULT_PARAMS, FORMULA_PRESETS, sanitiseParams, scorePlayers } from "../src/lib/scoring";

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
    };

    const rankings = scorePlayers([defender, forward], {
      ...DEFAULT_PARAMS,
      weights: { individual: 100, team: 0, fixtures: 0 },
    });

    expect(individualRaw(forward)).toBeGreaterThan(individualRaw(defender));
    expect(rankings[0].name).toBe("Finisher");
  });

  it("keeps an easy Coventry-style run from ranking the whole squad", () => {
    const coventryRun = [
      { event: 6, opponent: "Newcastle", difficulty: 3, wasHome: true, kickoffTime: null },
      { event: 7, opponent: "Spurs", difficulty: 3, wasHome: false, kickoffTime: null },
      { event: 8, opponent: "Fulham", difficulty: 2, wasHome: true, kickoffTime: null },
      { event: 9, opponent: "Sunderland", difficulty: 3, wasHome: true, kickoffTime: null },
      { event: 10, opponent: "Everton", difficulty: 3, wasHome: false, kickoffTime: null },
    ];
    const arsenalRun = [
      { event: 6, opponent: "Leeds", difficulty: 3, wasHome: true, kickoffTime: null },
      { event: 7, opponent: "Forest", difficulty: 3, wasHome: false, kickoffTime: null },
      { event: 8, opponent: "Everton", difficulty: 3, wasHome: true, kickoffTime: null },
      { event: 9, opponent: "Liverpool", difficulty: 4, wasHome: false, kickoffTime: null },
      { event: 10, opponent: "Hull", difficulty: 2, wasHome: true, kickoffTime: null },
    ];
    const starter = {
      ...basePlayer,
      name: "Coventry starter",
      team: "Coventry City",
      minutes: 270,
      xg: 0.4,
      xa: 0.2,
      formPoints: 8,
      attackCon: 40,
      defcon: 20,
      lastSeasonPointsPer90: 0,
      lastSeasonXgiPer90: 0,
      teamAttack: 2,
      teamDefence: 2,
      fixtures: coventryRun,
    };
    const unused = {
      ...starter,
      playerId: 2,
      name: "Coventry unused",
      minutes: 0,
      xg: 0,
      xa: 0,
      formPoints: 0,
      attackCon: 0,
      defcon: 0,
    };
    const star = {
      ...basePlayer,
      playerId: 3,
      name: "Arsenal starter",
      team: "Arsenal",
      minutes: 270,
      xg: 2.4,
      xa: 1.2,
      formPoints: 32,
      attackCon: 280,
      defcon: 15,
      teamAttack: 6,
      teamDefence: 4,
      fixtures: arsenalRun,
    };
    const preset = FORMULA_PRESETS.find((entry) => entry.id === "fixture-led");
    const rankings = scorePlayers(
      [starter, unused, star],
      {
        formWindow: preset?.formWindow ?? 3,
        fixtureHorizon: preset?.fixtureHorizon ?? 5,
        minMinutes: 0,
        weights: { ...(preset?.weights ?? { individual: 25, team: 15, fixtures: 60 }) },
      },
      { sampleGameweeks: 3, fixtureSlots: 5 },
    );

    expect(rankings[0]?.name).toBe("Arsenal starter");
    expect(rankings[2]?.name).toBe("Coventry unused");
    const coventryStarter = rankings.find((player) => player.name === "Coventry starter");
    const coventryUnused = rankings.find((player) => player.name === "Coventry unused");
    const arsenal = rankings.find((player) => player.name === "Arsenal starter");
    expect(coventryStarter?.breakdown.fixtures).toBeGreaterThan(arsenal?.breakdown.fixtures ?? 0);
    expect(coventryStarter?.breakdown.fixtures).toBeGreaterThan(coventryUnused?.breakdown.fixtures ?? 0);
    expect(coventryStarter?.breakdown.fixtures).toBeLessThan(100);
    expect(coventryUnused?.breakdown.fixtures).toBe(0);
  });

  it("counts blanks as missed games and doubles as extra games", () => {
    const options = { slots: 2, sampleGameweeks: 1 };
    const played = fixtureRaw(
      {
        ...basePlayer,
        minutes: 90,
        fixtures: [
          { event: 6, opponent: "Leeds", difficulty: 3, wasHome: true, kickoffTime: null },
          { event: 7, opponent: "Leeds", difficulty: 3, wasHome: true, kickoffTime: null },
        ],
      },
      options,
    );
    const blank = fixtureRaw(
      {
        ...basePlayer,
        minutes: 90,
        fixtures: [{ event: 6, opponent: "Leeds", difficulty: 3, wasHome: true, kickoffTime: null }],
      },
      options,
    );
    const double = fixtureRaw(
      {
        ...basePlayer,
        minutes: 90,
        fixtures: [
          { event: 6, opponent: "Leeds", difficulty: 4, wasHome: false, kickoffTime: null },
          { event: 6, opponent: "Burnley", difficulty: 4, wasHome: false, kickoffTime: null },
        ],
      },
      { slots: 1, sampleGameweeks: 1 },
    );
    const single = fixtureRaw(
      {
        ...basePlayer,
        minutes: 90,
        fixtures: [{ event: 6, opponent: "Leeds", difficulty: 4, wasHome: false, kickoffTime: null }],
      },
      { slots: 1, sampleGameweeks: 1 },
    );

    expect(played).toBeGreaterThan(blank);
    expect(played).toBeCloseTo(blank * 2, 5);
    expect(double).toBeCloseTo(single * 2, 5);
  });

  it("folds a legacy venue weight into fixtures", () => {
    expect(
      sanitiseParams({
        weights: { individual: 45, team: 20, fixtures: 25, venue: 10 },
      }).weights,
    ).toEqual({ individual: 45, team: 20, fixtures: 35 });
  });
});
