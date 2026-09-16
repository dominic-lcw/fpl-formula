import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORECAST_PARAMS,
  deriveAttackDefenceRatings,
  expectedGoalsForFixture,
  expectedValue,
  modelProbabilityForMarket,
  runBivariatePoissonMonteCarlo,
} from "../src/lib/match-forecast-model";

describe("match forecast model", () => {
  const teams = [
    {
      team_id: 1,
      name: "Alpha",
      short_name: "ALP",
      strength_attack_home: 1200,
      strength_attack_away: 1100,
      strength_defence_home: 1000,
      strength_defence_away: 1050,
    },
    {
      team_id: 2,
      name: "Beta",
      short_name: "BET",
      strength_attack_home: 900,
      strength_attack_away: 950,
      strength_defence_home: 1150,
      strength_defence_away: 1200,
    },
  ];

  const fixtures = [
    {
      fixture_id: 1,
      event: 1,
      kickoff_time: "2025-08-15T19:00:00Z",
      team_h: 1,
      team_a: 2,
      team_h_score: 2,
      team_a_score: 0,
    },
    {
      fixture_id: 2,
      event: 1,
      kickoff_time: "2025-08-16T14:00:00Z",
      team_h: 2,
      team_a: 1,
      team_h_score: 1,
      team_a_score: 1,
    },
  ];

  it("derives attack and defence multipliers from finished fixtures", () => {
    const result = deriveAttackDefenceRatings(fixtures, teams, DEFAULT_FORECAST_PARAMS);
    expect(result.strengths).toHaveLength(2);
    expect(result.leagueAverageGoals).toBeGreaterThan(0);
    expect(result.strengths[0]?.attackOverall).toBeGreaterThan(0);
    expect(result.strengths[0]?.defenceOverall).toBeGreaterThan(0);
  });

  it("produces expected goals for a fixture", () => {
    const { strengths, leagueAverageGoals, homeAdvantage } = deriveAttackDefenceRatings(
      fixtures,
      teams,
      DEFAULT_FORECAST_PARAMS,
    );
    const home = strengths.find((team) => team.teamId === 1)!;
    const away = strengths.find((team) => team.teamId === 2)!;
    const rates = expectedGoalsForFixture(home, away, leagueAverageGoals, homeAdvantage);
    expect(rates.lambdaHome).toBeGreaterThan(rates.lambdaAway);
  });

  it("recomputes expected goals when formula params change", () => {
    const baseline = deriveAttackDefenceRatings(fixtures, teams, {
      ...DEFAULT_FORECAST_PARAMS,
      homeAdvantage: 1.05,
      fplStrengthBlend: 0,
    });
    const boosted = deriveAttackDefenceRatings(fixtures, teams, {
      ...DEFAULT_FORECAST_PARAMS,
      homeAdvantage: 1.3,
      fplStrengthBlend: 0,
    });
    const home = baseline.strengths.find((team) => team.teamId === 1)!;
    const away = baseline.strengths.find((team) => team.teamId === 2)!;
    const lowHomeAdv = expectedGoalsForFixture(home, away, baseline.leagueAverageGoals, baseline.homeAdvantage);
    const highHomeAdv = expectedGoalsForFixture(home, away, boosted.leagueAverageGoals, boosted.homeAdvantage);
    expect(highHomeAdv.lambdaHome).toBeGreaterThan(lowHomeAdv.lambdaHome);
    expect(highHomeAdv.lambdaAway).toBeCloseTo(lowHomeAdv.lambdaAway, 5);
  });

  it("runs bivariate Poisson Monte Carlo with probabilities summing to ~1 for 1X2", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32;
      return seed / 2 ** 32;
    };
    const simulation = runBivariatePoissonMonteCarlo(1.6, 0.9, 0.08, 5000, random);
    expect(simulation.expectedHomeGoals).toBeGreaterThan(0);
    expect(simulation.expectedAwayGoals).toBeGreaterThan(0);
    expect(simulation.homeWinProb + simulation.drawProb + simulation.awayWinProb).toBeCloseTo(1, 2);
    expect(simulation.topScorelines.length).toBeGreaterThan(0);
  });

  it("calculates expected value from model probability and odds", () => {
    expect(expectedValue(0.5, 2.2)).toBeCloseTo(0.1, 5);
    expect(modelProbabilityForMarket(
      {
        homeWinProb: 0.5,
        drawProb: 0.25,
        awayWinProb: 0.25,
        over25Prob: 0.55,
        bttsProb: 0.5,
        topScorelines: [{ home: 1, away: 1, prob: 0.12 }],
      },
      "1X2",
      "home",
    )).toBe(0.5);
  });
});
