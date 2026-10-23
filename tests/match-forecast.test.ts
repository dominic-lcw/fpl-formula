import { describe, expect, it } from "vitest";
import { estimateAttackDefenceMatrix } from "../src/lib/match-forecast-matrix";
import {
  DEFAULT_FORECAST_PARAMS,
  deriveAttackDefenceRatings,
  expectedGoalsForFixture,
  expectedValue,
  forecastRatingGameweekStart,
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

  it("derives the rating lookback window from the latest finished Gameweek", () => {
    expect(forecastRatingGameweekStart(12, 10)).toBe(3);
    expect(forecastRatingGameweekStart(4, 10)).toBe(1);
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

  it("shares a scoreline between attack and the opponent's defence", () => {
    const team = (id: number, name: string) => ({
      team_id: id,
      name,
      short_name: name,
      strength_attack_home: null,
      strength_attack_away: null,
      strength_defence_home: null,
      strength_defence_away: null,
    });
    const fixtures = [
      { fixture_id: 1, event: 1, kickoff_time: null, team_h: 1, team_a: 2, team_h_score: 5, team_a_score: 1 },
      { fixture_id: 2, event: 1, kickoff_time: null, team_h: 1, team_a: 3, team_h_score: 4, team_a_score: 0 },
      { fixture_id: 3, event: 1, kickoff_time: null, team_h: 1, team_a: 4, team_h_score: 3, team_a_score: 0 },
      { fixture_id: 4, event: 2, kickoff_time: null, team_h: 4, team_a: 2, team_h_score: 5, team_a_score: 0 },
      { fixture_id: 5, event: 2, kickoff_time: null, team_h: 3, team_a: 4, team_h_score: 1, team_a_score: 0 },
      { fixture_id: 6, event: 2, kickoff_time: null, team_h: 2, team_a: 3, team_h_score: 1, team_a_score: 1 },
    ];
    const rates = estimateAttackDefenceMatrix(fixtures, [1, 2, 3, 4], 1.4, 0);
    const concededToStrongAttacks = rates.get(2)!.defenceAway;
    const concededToWeakerAttack = rates.get(2)!.defenceHome;
    expect(concededToStrongAttacks).toBeLessThan(concededToWeakerAttack);
    expect(rates.get(1)!.attackHome).toBeGreaterThan(rates.get(4)!.attackHome);

    const rated = deriveAttackDefenceRatings(fixtures, [1, 2, 3, 4].map((id) => team(id, `T${id}`)), {
      ...DEFAULT_FORECAST_PARAMS,
      fplStrengthBlend: 0,
      formulaStrengthBlend: 0,
      attackGoalsCap: 0,
    });
    const side = rated.strengths.find((row) => row.teamId === 2)!;
    expect(side.defenceAway).toBeLessThan(side.defenceHome);
    const elite = rated.strengths.find((row) => row.teamId === 1)!;
    const softer = rated.strengths.find((row) => row.teamId === 4)!;
    expect(elite.attackHome).toBeGreaterThan(softer.attackHome);
  });

  it("does not call two teams equal when only the opponent differed", () => {
    const team = (id: number) => ({
      team_id: id,
      name: `T${id}`,
      short_name: `T${id}`,
      strength_attack_home: 1000,
      strength_attack_away: 1000,
      strength_defence_home: 1000,
      strength_defence_away: 1000,
    });
    const repeat = (
      fixture: { team_h: number; team_a: number; team_h_score: number; team_a_score: number },
      times: number,
      idStart: number,
    ) => Array.from({ length: times }, (_, index) => ({
      fixture_id: idStart + index,
      event: 1,
      kickoff_time: null,
      ...fixture,
    }));
    const fixtures = [
      ...repeat({ team_h: 1, team_a: 2, team_h_score: 3, team_a_score: 0 }, 6, 1),
      ...repeat({ team_h: 2, team_a: 1, team_h_score: 0, team_a_score: 3 }, 6, 10),
      ...repeat({ team_h: 1, team_a: 3, team_h_score: 2, team_a_score: 0 }, 6, 20),
      ...repeat({ team_h: 2, team_a: 4, team_h_score: 2, team_a_score: 0 }, 6, 30),
      ...repeat({ team_h: 3, team_a: 1, team_h_score: 1, team_a_score: 0 }, 6, 40),
      ...repeat({ team_h: 4, team_a: 2, team_h_score: 1, team_a_score: 0 }, 6, 50),
    ];
    const rated = deriveAttackDefenceRatings(fixtures, [1, 2, 3, 4].map(team), {
      ...DEFAULT_FORECAST_PARAMS,
      homeAdvantage: 1,
      fplStrengthBlend: 0,
      formulaStrengthBlend: 0,
      attackGoalsCap: 0,
    });
    const unlucky = rated.strengths.find((row) => row.teamId === 3)!;
    const poor = rated.strengths.find((row) => row.teamId === 4)!;
    expect(unlucky.defenceAway).toBeLessThan(poor.defenceAway);
    expect(unlucky.attackHome).toBeGreaterThan(poor.attackHome);

    const flatProcess = [1, 2, 3, 4].flatMap((teamId) => [true, false].map((wasHome) => ({
      team_id: teamId,
      was_home: wasHome,
      event: 1,
      xgi: 1.2,
      attack_con: 80,
      defcon: 40,
      minutes: 90,
      expected_goals_conceded: 1.1,
    })));
    const blended = deriveAttackDefenceRatings(fixtures, [1, 2, 3, 4].map(team), {
      ...DEFAULT_FORECAST_PARAMS,
      homeAdvantage: 1,
      fplStrengthBlend: 0,
      formulaStrengthBlend: 0.55,
      attackGoalsCap: 0,
    }, flatProcess);
    const blendedUnlucky = blended.strengths.find((row) => row.teamId === 3)!;
    const blendedPoor = blended.strengths.find((row) => row.teamId === 4)!;
    expect(blendedUnlucky.defenceAway).toBeLessThan(blendedPoor.defenceAway);
    expect(blendedUnlucky.attackHome).toBeGreaterThan(blendedPoor.attackHome);
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
