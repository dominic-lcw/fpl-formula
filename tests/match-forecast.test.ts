import { describe, expect, it } from "vitest";
import {
  applyMonteCarloBatch,
  createMonteCarloAccumulator,
  DEFAULT_FORECAST_PARAMS,
  deriveAttackDefenceRatings,
  expectedGoalsForFixture,
  expectedValue,
  modelProbabilityForMarket,
  runBivariatePoissonMonteCarlo,
  SCORE_AXIS_MAX,
  scoreAxisLabel,
  scoreCellIndex,
  snapshotMonteCarlo,
} from "../src/lib/match-forecast-model";
import { clampSimulationCount, forecastMatchHref, monteCarloBatchSize } from "../src/lib/match-simulation";

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

  it("streams the same Monte Carlo counts in batches as in one run", () => {
    const makeRandom = (seedStart: number) => {
      let seed = seedStart;
      return () => {
        seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32;
        return seed / 2 ** 32;
      };
    };

    const chunked = createMonteCarloAccumulator();
    const chunkedRandom = makeRandom(7);
    let completed = 0;
    while (completed < 800) {
      const batch = monteCarloBatchSize(800, completed);
      expect(batch).toBeGreaterThan(0);
      applyMonteCarloBatch(chunked, 1.5, 1.1, 0.1, batch, chunkedRandom);
      completed += batch;
    }

    const single = createMonteCarloAccumulator();
    applyMonteCarloBatch(single, 1.5, 1.1, 0.1, 800, makeRandom(7));
    const chunkedSnapshot = snapshotMonteCarlo(chunked);
    const singleSnapshot = snapshotMonteCarlo(single);
    expect(chunkedSnapshot.counts).toEqual(singleSnapshot.counts);
    expect(chunkedSnapshot.simulations).toBe(800);
    expect(chunked.counts.reduce((sum, count) => sum + count, 0)).toBe(800);

    const full = runBivariatePoissonMonteCarlo(1.5, 1.1, 0.1, 800, makeRandom(7));
    expect(full.homeWinProb).toBeCloseTo(chunkedSnapshot.homeWinProb, 10);
    expect(full.drawProb).toBeCloseTo(chunkedSnapshot.drawProb, 10);
    expect(full.awayWinProb).toBeCloseTo(chunkedSnapshot.awayWinProb, 10);
    expect(full.expectedHomeGoals).toBeCloseTo(chunkedSnapshot.expectedHomeGoals, 10);
    expect(full.expectedAwayGoals).toBeCloseTo(chunkedSnapshot.expectedAwayGoals, 10);
    expect(chunkedSnapshot.homeWinProb + chunkedSnapshot.drawProb + chunkedSnapshot.awayWinProb).toBeCloseTo(1, 8);
  });

  it("bins scores of 7 or more into the last grid cell", () => {
    expect(scoreAxisLabel(3)).toBe("3");
    expect(scoreAxisLabel(SCORE_AXIS_MAX)).toBe("7+");
    expect(scoreCellIndex(8, 1)).toBe(scoreCellIndex(7, 1));

    let seed = 3;
    const accumulator = createMonteCarloAccumulator();
    applyMonteCarloBatch(accumulator, 12, 0.2, 0, 400, () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 2 ** 32;
      return seed / 2 ** 32;
    });
    const overflow = Array.from({ length: 8 }, (_, away) => accumulator.counts[scoreCellIndex(7, away)] ?? 0)
      .reduce((sum, count) => sum + count, 0);
    expect(overflow).toBeGreaterThan(0);
    expect(accumulator.counts.reduce((sum, count) => sum + count, 0)).toBe(400);
  });
});

describe("match simulation controls", () => {
  it("clamps n and links a fixture to its simulation page", () => {
    expect(clampSimulationCount(10)).toBe(100);
    expect(clampSimulationCount(1_000_000)).toBe(100_000);
    expect(clampSimulationCount(Number.NaN)).toBe(5_000);
    expect(forecastMatchHref(9, DEFAULT_FORECAST_PARAMS)).toBe(
      "/forecast/9?lookback=10&homeAdvantage=1.12&correlation=0.08&simulations=10000&fplBlend=0.35",
    );
  });
});
