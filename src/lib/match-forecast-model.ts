import {
  buildFormulaVenueMultipliers,
  type PlayerFixtureFormulaRow,
} from "@/lib/match-forecast-formula-ratings";
import { estimateAttackDefenceMatrix } from "@/lib/match-forecast-matrix";

export type TeamStrength = {
  teamId: number;
  name: string;
  shortName: string;
  attackHome: number;
  attackAway: number;
  defenceHome: number;
  defenceAway: number;
  attackOverall: number;
  defenceOverall: number;
  matchesPlayed: number;
};

export type FixtureForecast = {
  fixtureId: number;
  event: number | null;
  kickoffTime: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: string;
  awayTeam: string;
  homeShortName: string;
  awayShortName: string;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  over25Prob: number;
  bttsProb: number;
  topScorelines: Array<{ home: number; away: number; prob: number }>;
  lambdaHome: number;
  lambdaAway: number;
  lambdaShared: number;
};

export type ForecastParams = {
  lookbackGameweeks: number;
  homeAdvantage: number;
  correlation: number;
  simulations: number;
  fplStrengthBlend: number;
  /** Blend rankings-style team attack/defence (xGI, AtkCon, DefCon, …) into λ multipliers. */
  formulaStrengthBlend: number;
  /** Cap goals per match when scoring attack rates (0 = no cap). Defence uses actual goals. */
  attackGoalsCap: number;
};

export const DEFAULT_FORECAST_PARAMS: ForecastParams = {
  lookbackGameweeks: 10,
  homeAdvantage: 1.12,
  correlation: 0.08,
  simulations: 10_000,
  fplStrengthBlend: 0.35,
  formulaStrengthBlend: 0.55,
  attackGoalsCap: 3,
};

export type FinishedFixtureRow = {
  fixture_id: number;
  event: number | null;
  kickoff_time: Date | string | null;
  team_h: number;
  team_a: number;
  team_h_score: number;
  team_a_score: number;
};

export type TeamRatingRow = {
  team_id: number;
  name: string;
  short_name: string;
  strength_attack_home: number | null;
  strength_attack_away: number | null;
  strength_defence_home: number | null;
  strength_defence_away: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function poissonSample(lambda: number, random = Math.random) {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let product = random();
  let count = 0;
  while (product > limit) {
    count += 1;
    product *= random();
  }
  return count;
}

function bivariatePoissonSample(lambdaHome: number, lambdaAway: number, lambdaShared: number, random = Math.random) {
  const homeIndependent = poissonSample(Math.max(0, lambdaHome - lambdaShared), random);
  const awayIndependent = poissonSample(Math.max(0, lambdaAway - lambdaShared), random);
  const shared = poissonSample(lambdaShared, random);
  return { home: homeIndependent + shared, away: awayIndependent + shared };
}

function scorelineKey(home: number, away: number) {
  return `${home}-${away}`;
}

function normaliseFplStrength(value: number | null, baseline = 1000) {
  if (!value || !Number.isFinite(value)) return 1;
  return clamp(value / baseline, 0.65, 1.35);
}

/** First finished Gameweek included in the rating lookback (inclusive). */
export function forecastRatingGameweekStart(completedGameweek: number, lookbackGameweeks: number) {
  return Math.max(1, completedGameweek - lookbackGameweeks + 1);
}

export const FORECAST_LAMBDA_HOME_TEXT =
  "λ_home = league avg × home attack (H) × away defence (A) × home advantage";

export const FORECAST_LAMBDA_AWAY_TEXT = "λ_away = league avg × away attack (A) × home defence (H)";

export const FORECAST_MATRIX_HOME_TEXT =
  "home goals(i, j) ≈ league avg × attack_home(i) × defence_away(j)";

export const FORECAST_MATRIX_AWAY_TEXT =
  "away goals(i, j) ≈ league avg × attack_away(j) × defence_home(i)";

export const FORECAST_RATING_NOTE =
  "Attack and defence solve that match matrix together. A scoreline is shared by the scorer's attack and the opponent's defence, so the same result against a stronger side moves a rating less than it does against a weaker side. Home and away are solved separately, then each group is scaled to a geometric mean of 1. Attack uses capped goals; defence uses the goals actually conceded. Those multipliers are blended with process stats (squad xGI, AtkCon, DefCon, expected goals conceded) and official FPL strength, then clamped to 0.45–2.2. The home-advantage control is applied only when ratings become expected goals.";

export const FORECAST_SIMULATION_NOTE =
  "A bivariate Poisson draw uses λ_home, λ_away, and a shared λ₃ from the correlation control. Monte Carlo counts produce 1X2, over 2.5, BTTS, and scoreline probabilities.";

export function deriveAttackDefenceRatings(
  fixtures: FinishedFixtureRow[],
  teams: TeamRatingRow[],
  params: Pick<
    ForecastParams,
    "homeAdvantage" | "fplStrengthBlend" | "formulaStrengthBlend" | "attackGoalsCap"
  >,
  playerRows: PlayerFixtureFormulaRow[] = [],
) {
  const sampleOptions = { attackGoalsCap: params.attackGoalsCap };
  const stats = new Map<number, { homeMatches: number; awayMatches: number }>();

  for (const team of teams) {
    stats.set(team.team_id, { homeMatches: 0, awayMatches: 0 });
  }

  for (const fixture of fixtures) {
    const home = stats.get(fixture.team_h);
    const away = stats.get(fixture.team_a);
    if (!home || !away) continue;
    home.homeMatches += 1;
    away.awayMatches += 1;
  }

  const totalGoals = fixtures.reduce((sum, fixture) => sum + fixture.team_h_score + fixture.team_a_score, 0);
  const totalMatches = fixtures.length;
  const leagueAverage = totalMatches > 0 ? totalGoals / (totalMatches * 2) : 1.35;
  const blend = clamp(params.fplStrengthBlend, 0, 1);
  const matrix = estimateAttackDefenceMatrix(
    fixtures,
    teams.map((team) => team.team_id),
    leagueAverage,
    params.attackGoalsCap,
  );
  const formulaVenue =
    playerRows.length > 0 && params.formulaStrengthBlend > 0
      ? buildFormulaVenueMultipliers(
          fixtures,
          teams,
          playerRows,
          leagueAverage,
          params.formulaStrengthBlend,
          sampleOptions,
          matrix,
        )
      : null;

  const strengths: TeamStrength[] = [];

  for (const team of teams) {
    const record = stats.get(team.team_id)!;
    const matchesPlayed = record.homeMatches + record.awayMatches;
    const solved = matrix.get(team.team_id);
    const formula = formulaVenue?.get(team.team_id);

    const observedAttackHome = formula
      ? formula.attackHome
      : record.homeMatches
        ? solved?.attackHome ?? 1
        : 1;
    const observedAttackAway = formula
      ? formula.attackAway
      : record.awayMatches
        ? solved?.attackAway ?? 1
        : 1;
    const observedDefenceHome = formula
      ? formula.defenceHome
      : record.homeMatches
        ? solved?.defenceHome ?? 1
        : 1;
    const observedDefenceAway = formula
      ? formula.defenceAway
      : record.awayMatches
        ? solved?.defenceAway ?? 1
        : 1;

    const fplAttackHome = normaliseFplStrength(team.strength_attack_home);
    const fplAttackAway = normaliseFplStrength(team.strength_attack_away);
    const fplDefenceHome = normaliseFplStrength(team.strength_defence_home);
    const fplDefenceAway = normaliseFplStrength(team.strength_defence_away);

    const attackHome = observedAttackHome * (1 - blend) + fplAttackHome * blend;
    const attackAway = observedAttackAway * (1 - blend) + fplAttackAway * blend;
    const defenceHome = observedDefenceHome * (1 - blend) + fplDefenceHome * blend;
    const defenceAway = observedDefenceAway * (1 - blend) + fplDefenceAway * blend;

    const attackOverall = matchesPlayed
      ? (attackHome * record.homeMatches + attackAway * record.awayMatches) / matchesPlayed
      : (attackHome + attackAway) / 2;
    const defenceOverall = matchesPlayed
      ? (defenceHome * record.homeMatches + defenceAway * record.awayMatches) / matchesPlayed
      : (defenceHome + defenceAway) / 2;

    strengths.push({
      teamId: team.team_id,
      name: team.name,
      shortName: team.short_name ?? team.name,
      attackHome: clamp(attackHome, 0.45, 2.2),
      attackAway: clamp(attackAway, 0.45, 2.2),
      defenceHome: clamp(defenceHome, 0.45, 2.2),
      defenceAway: clamp(defenceAway, 0.45, 2.2),
      attackOverall: clamp(attackOverall, 0.45, 2.2),
      defenceOverall: clamp(defenceOverall, 0.45, 2.2),
      matchesPlayed,
    });
  }

  return {
    leagueAverageGoals: leagueAverage,
    homeAdvantage: params.homeAdvantage,
    strengths: strengths.sort((left, right) => right.attackOverall - left.attackOverall),
  };
}

export function expectedGoalsForFixture(
  homeTeam: TeamStrength,
  awayTeam: TeamStrength,
  leagueAverageGoals: number,
  homeAdvantage: number,
) {
  const lambdaHome = leagueAverageGoals * homeTeam.attackHome * awayTeam.defenceAway * homeAdvantage;
  const lambdaAway = leagueAverageGoals * awayTeam.attackAway * homeTeam.defenceHome;
  return {
    lambdaHome: clamp(lambdaHome, 0.05, 4.5),
    lambdaAway: clamp(lambdaAway, 0.05, 4.5),
  };
}

export function runBivariatePoissonMonteCarlo(
  lambdaHome: number,
  lambdaAway: number,
  correlation: number,
  simulations: number,
  random = Math.random,
) {
  const lambdaShared = clamp(correlation * Math.sqrt(lambdaHome * lambdaAway), 0, Math.min(lambdaHome, lambdaAway) * 0.85);
  const counts = new Map<string, number>();
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let over25 = 0;
  let btts = 0;
  let totalHome = 0;
  let totalAway = 0;

  for (let index = 0; index < simulations; index += 1) {
    const sample = bivariatePoissonSample(lambdaHome, lambdaAway, lambdaShared, random);
    totalHome += sample.home;
    totalAway += sample.away;
    const key = scorelineKey(sample.home, sample.away);
    counts.set(key, (counts.get(key) ?? 0) + 1);

    if (sample.home > sample.away) homeWins += 1;
    else if (sample.home < sample.away) awayWins += 1;
    else draws += 1;

    if (sample.home + sample.away > 2.5) over25 += 1;
    if (sample.home > 0 && sample.away > 0) btts += 1;
  }

  const topScorelines = [...counts.entries()]
    .map(([key, count]) => {
      const [home, away] = key.split("-").map(Number);
      return { home, away, prob: count / simulations };
    })
    .sort((left, right) => right.prob - left.prob)
    .slice(0, 8);

  return {
    expectedHomeGoals: totalHome / simulations,
    expectedAwayGoals: totalAway / simulations,
    homeWinProb: homeWins / simulations,
    drawProb: draws / simulations,
    awayWinProb: awayWins / simulations,
    over25Prob: over25 / simulations,
    bttsProb: btts / simulations,
    topScorelines,
    lambdaShared,
  };
}

export function modelProbabilityForMarket(
  forecast: Pick<FixtureForecast, "homeWinProb" | "drawProb" | "awayWinProb" | "over25Prob" | "bttsProb" | "topScorelines">,
  market: string,
  selection: string,
) {
  switch (market) {
    case "1X2":
      if (selection === "home") return forecast.homeWinProb;
      if (selection === "draw") return forecast.drawProb;
      if (selection === "away") return forecast.awayWinProb;
      break;
    case "over_under":
      if (selection === "over_2.5") return forecast.over25Prob;
      if (selection === "under_2.5") return 1 - forecast.over25Prob;
      break;
    case "btts":
      if (selection === "yes") return forecast.bttsProb;
      if (selection === "no") return 1 - forecast.bttsProb;
      break;
    case "correct_score": {
      const [home, away] = selection.split("-").map(Number);
      if (!Number.isFinite(home) || !Number.isFinite(away)) return 0;
      return forecast.topScorelines.find((line) => line.home === home && line.away === away)?.prob ?? 0;
    }
    default:
      break;
  }
  return 0;
}

export function expectedValue(modelProb: number, odds: number) {
  if (!Number.isFinite(modelProb) || !Number.isFinite(odds) || odds <= 1) return 0;
  return modelProb * odds - 1;
}

export function buildFixtureForecast(
  fixture: FinishedFixtureRow & { finished?: boolean },
  homeTeam: TeamStrength,
  awayTeam: TeamStrength,
  homeMeta: TeamRatingRow,
  awayMeta: TeamRatingRow,
  leagueAverageGoals: number,
  homeAdvantage: number,
  params: Pick<ForecastParams, "correlation" | "simulations">,
): FixtureForecast {
  const { lambdaHome, lambdaAway } = expectedGoalsForFixture(
    homeTeam,
    awayTeam,
    leagueAverageGoals,
    homeAdvantage,
  );
  const simulation = runBivariatePoissonMonteCarlo(
    lambdaHome,
    lambdaAway,
    params.correlation,
    params.simulations,
  );

  return {
    fixtureId: fixture.fixture_id,
    event: fixture.event,
    kickoffTime: fixture.kickoff_time ? String(fixture.kickoff_time) : null,
    homeTeamId: fixture.team_h,
    awayTeamId: fixture.team_a,
    homeTeam: homeMeta.name,
    awayTeam: awayMeta.name,
    homeShortName: homeMeta.short_name ?? homeMeta.name,
    awayShortName: awayMeta.short_name ?? awayMeta.name,
    expectedHomeGoals: simulation.expectedHomeGoals,
    expectedAwayGoals: simulation.expectedAwayGoals,
    homeWinProb: simulation.homeWinProb,
    drawProb: simulation.drawProb,
    awayWinProb: simulation.awayWinProb,
    over25Prob: simulation.over25Prob,
    bttsProb: simulation.bttsProb,
    topScorelines: simulation.topScorelines,
    lambdaHome,
    lambdaAway,
    lambdaShared: simulation.lambdaShared,
  };
}
