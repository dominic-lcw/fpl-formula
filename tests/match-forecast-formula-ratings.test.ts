import { describe, expect, it } from "vitest";
import { deriveAttackDefenceRatings } from "../src/lib/match-forecast-model";
import {
  buildFormulaVenueMultipliers,
  buildVenueBuckets,
  capGoalsForAttackRate,
  ridgeRegression,
  teamFormulaAttackRaw,
  teamFormulaDefenceRaw,
  weightedAttackRate,
  type ForecastSampleOptions,
} from "../src/lib/match-forecast-formula-ratings";

const defaultSample: ForecastSampleOptions = { attackGoalsCap: 3 };

function sampleBucket(overrides: Partial<{
  weightSum: number;
  weightedPoints: number;
  weightedScoredForAttack: number;
  weightedConceded: number;
  xgi: number;
  attackCon: number;
  defcon: number;
}>) {
  return {
    weightSum: 1,
    weightedPoints: 3,
    weightedScored: 2,
    weightedScoredForAttack: 2,
    weightedConceded: 0,
    xgi: 0,
    attackCon: 0,
    defcon: 0,
    xgc: 0,
    minutes: 0,
    playerWeightSum: 0,
    ...overrides,
  };
}

describe("match forecast formula ratings", () => {
  it("builds attack raw from xGI and attack contribution like rankings team form", () => {
    const raw = teamFormulaAttackRaw(sampleBucket({ xgi: 2.5, attackCon: 200 }));
    expect(raw).toBeGreaterThan(3);
  });

  it("builds defence raw from conceded goals and defcon", () => {
    const leaky = teamFormulaDefenceRaw(sampleBucket({ weightedConceded: 3, defcon: 40 }));
    const solid = teamFormulaDefenceRaw(sampleBucket({ weightedPoints: 3, weightedConceded: 0, defcon: 90 }));
    expect(solid).toBeGreaterThan(leaky);
  });

  it("caps blowout goals when scoring attack rate", () => {
    const capped = buildVenueBuckets(
      [
        {
          fixture_id: 1,
          event: 2,
          kickoff_time: null,
          team_h: 16,
          team_a: 12,
          team_h_score: 5,
          team_a_score: 2,
        },
        {
          fixture_id: 2,
          event: 6,
          kickoff_time: null,
          team_h: 16,
          team_a: 19,
          team_h_score: 1,
          team_a_score: 1,
        },
        {
          fixture_id: 3,
          event: 4,
          kickoff_time: null,
          team_h: 16,
          team_a: 15,
          team_h_score: 0,
          team_a_score: 1,
        },
      ],
      [],
      defaultSample,
    );
    const uncapped = buildVenueBuckets(
      [
        {
          fixture_id: 1,
          event: 2,
          kickoff_time: null,
          team_h: 16,
          team_a: 12,
          team_h_score: 5,
          team_a_score: 2,
        },
        {
          fixture_id: 2,
          event: 6,
          kickoff_time: null,
          team_h: 16,
          team_a: 19,
          team_h_score: 1,
          team_a_score: 1,
        },
        {
          fixture_id: 3,
          event: 4,
          kickoff_time: null,
          team_h: 16,
          team_a: 15,
          team_h_score: 0,
          team_a_score: 1,
        },
      ],
      [],
      { attackGoalsCap: 0 },
    );
    const homeCapped = capped.get("16:H")!;
    const homeUncapped = uncapped.get("16:H")!;
    expect(weightedAttackRate(homeCapped, 1.35)).toBeLessThan(weightedAttackRate(homeUncapped, 1.35));
    expect(capGoalsForAttackRate(5, 3)).toBe(3);
  });

  it("uses player xGI and AtkCon when formula blend is on", () => {
    const teams = [
      {
        team_id: 1,
        name: "Alpha",
        short_name: "ALP",
        strength_attack_home: 1000,
        strength_attack_away: 1000,
        strength_defence_home: 1000,
        strength_defence_away: 1000,
      },
      {
        team_id: 2,
        name: "Beta",
        short_name: "BET",
        strength_attack_home: 1000,
        strength_attack_away: 1000,
        strength_defence_home: 1000,
        strength_defence_away: 1000,
      },
    ];
    const fixtures = [
      {
        fixture_id: 1,
        event: 1,
        kickoff_time: null,
        team_h: 1,
        team_a: 2,
        team_h_score: 1,
        team_a_score: 1,
      },
    ];
    const params = {
      homeAdvantage: 1.1,
      fplStrengthBlend: 0,
      formulaStrengthBlend: 1,
      attackGoalsCap: 0,
    };
    const withoutPlayerStats = deriveAttackDefenceRatings(fixtures, teams, params, []);
    const withPlayerStats = deriveAttackDefenceRatings(fixtures, teams, params, [
      {
        team_id: 1,
        was_home: true,
        event: 1,
        xgi: 4,
        attack_con: 500,
        defcon: 10,
        minutes: 90,
        expected_goals_conceded: 0.2,
      },
    ]);
    const homeWithout = withoutPlayerStats.strengths.find((team) => team.teamId === 1)!.attackHome;
    const homeWith = withPlayerStats.strengths.find((team) => team.teamId === 1)!.attackHome;
    expect(homeWith).toBeGreaterThan(homeWithout);
  });

  it("fits ridge regression when enough samples exist", () => {
    const design = [
      [1, 2, 10, 0.5, 1],
      [1, 1, 8, 0.8, 1.1],
      [1, 3, 12, 0.3, 0.9],
      [1, 0.5, 6, 1.1, 1.2],
      [1, 2.2, 11, 0.4, 0.95],
      [1, 1.5, 9, 0.7, 1.05],
      [1, 2.8, 13, 0.35, 0.88],
      [1, 0.8, 7, 0.95, 1.15],
    ];
    const coefficients = ridgeRegression(
      design,
      [1.4, 1.8, 1.1, 2, 1.3, 1.6, 1.05, 1.9],
    );
    expect(coefficients).not.toBeNull();
    expect(coefficients!.length).toBe(5);
  });

  it("returns venue multipliers for each team", () => {
    const map = buildFormulaVenueMultipliers(
      [
        {
          fixture_id: 1,
          event: 1,
          kickoff_time: null,
          team_h: 1,
          team_a: 2,
          team_h_score: 1,
          team_a_score: 1,
        },
      ],
      [
        {
          team_id: 1,
          name: "A",
          short_name: "A",
          strength_attack_home: 1000,
          strength_attack_away: 1000,
          strength_defence_home: 1000,
          strength_defence_away: 1000,
        },
        {
          team_id: 2,
          name: "B",
          short_name: "B",
          strength_attack_home: 1000,
          strength_attack_away: 1000,
          strength_defence_home: 1000,
          strength_defence_away: 1000,
        },
      ],
      [],
      1.35,
      0.5,
      defaultSample,
    );
    expect(map.get(1)?.attackHome).toBeGreaterThan(0);
    expect(map.get(2)?.defenceAway).toBeGreaterThan(0);
  });
});
