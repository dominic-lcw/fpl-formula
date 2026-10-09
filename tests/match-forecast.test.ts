import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORECAST_PARAMS,
  deriveAttackDefenceRatings,
  expectedGoalsForFixture,
  expectedValue,
  jamesSteinShrink,
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

  it("shrinks a short sample of rating indexes to the league average", () => {
    const shrunk = jamesSteinShrink(
      [
        { value: 1.4, matches: 1 },
        { value: 0.6, matches: 1 },
        { value: 1.2, matches: 1 },
        { value: 0.8, matches: 1 },
        { value: 1.1, matches: 1 },
        { value: 0.9, matches: 1 },
      ],
      1.4,
    );
    expect(shrunk.every((value) => value === 1)).toBe(true);
  });

  it("keeps a large-sample rating gap and leaves two teams unshrunk", () => {
    const shrunk = jamesSteinShrink(
      [
        { value: 1.8, matches: 30 },
        { value: 1.2, matches: 30 },
        { value: 0.8, matches: 30 },
        { value: 0.5, matches: 30 },
      ],
      1.4,
    );
    expect(shrunk[0]).toBeGreaterThan(1.7);
    expect(shrunk[0]).toBeLessThan(1.8);
    expect(shrunk[0]).toBeGreaterThan(shrunk[1]!);
    expect(shrunk[1]).toBeGreaterThan(shrunk[2]!);
    expect(shrunk[2]).toBeGreaterThan(shrunk[3]!);

    expect(jamesSteinShrink(
      [
        { value: 2, matches: 1 },
        { value: 0.4, matches: 1 },
      ],
      1.4,
    )).toEqual([2, 0.4]);
  });

  it("pulls one-game attack ratings together once enough teams have played", () => {
    const names = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    const squads = names.map((name, index) => ({
      team_id: index + 1,
      name,
      short_name: name,
      strength_attack_home: 1000,
      strength_attack_away: 1000,
      strength_defence_home: 1000,
      strength_defence_away: 1000,
    }));
    const scores: Array<[number, number]> = [[2, 1], [2, 1], [1, 1], [1, 1], [1, 2], [0, 1]];
    const played = scores.map(([home, away], index) => ({
      fixture_id: index + 1,
      event: 1,
      kickoff_time: null,
      team_h: index * 2 + 1,
      team_a: index * 2 + 2,
      team_h_score: home,
      team_a_score: away,
    }));
    const { strengths } = deriveAttackDefenceRatings(played, squads, {
      ...DEFAULT_FORECAST_PARAMS,
      fplStrengthBlend: 0,
    });
    const homeAttack = [1, 5, 11].map((teamId) => strengths.find((team) => team.teamId === teamId)!.attackHome);
    expect(homeAttack).toEqual([1, 1, 1]);
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
