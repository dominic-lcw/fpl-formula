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
};

export const DEFAULT_FORECAST_PARAMS: ForecastParams = {
  lookbackGameweeks: 10,
  homeAdvantage: 1.12,
  correlation: 0.08,
  simulations: 10_000,
  fplStrengthBlend: 0.35,
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

export type OpponentAdjustedRates = {
  attackHome: number;
  attackAway: number;
  defenceHome: number;
  defenceAway: number;
};

function geometricMean(values: number[]) {
  if (!values.length) return 1;
  const logSum = values.reduce((sum, value) => sum + Math.log(Math.max(value, 1e-6)), 0);
  return Math.exp(logSum / values.length);
}

function normaliseRatingGroup(ratings: Map<number, number>, activeIds: number[]) {
  const active = activeIds.map((id) => ratings.get(id) ?? 1).filter((value) => value > 0);
  const mean = geometricMean(active);
  if (!(mean > 0)) return;
  for (const id of activeIds) {
    ratings.set(id, (ratings.get(id) ?? 1) / mean);
  }
}

/**
 * Iterative attack–defence fit. Goals conceded are divided by the opponent's
 * attack (and home advantage), so a 5–1 against a strong side moves defence
 * less than the same score against a weak side.
 */
export function estimateOpponentAdjustedRates(
  fixtures: FinishedFixtureRow[],
  teamIds: number[],
  homeAdvantage: number,
  leagueAverage: number,
  iterations = 24,
): Map<number, OpponentAdjustedRates> {
  const attackHome = new Map(teamIds.map((id) => [id, 1]));
  const attackAway = new Map(teamIds.map((id) => [id, 1]));
  const defenceHome = new Map(teamIds.map((id) => [id, 1]));
  const defenceAway = new Map(teamIds.map((id) => [id, 1]));
  const known = new Set(teamIds);
  const matches = fixtures.filter((fixture) => known.has(fixture.team_h) && known.has(fixture.team_a));
  const average = leagueAverage > 0 ? leagueAverage : 1.35;
  const advantage = homeAdvantage > 0 ? homeAdvantage : 1;

  if (matches.length) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const attackHomeNum = new Map(teamIds.map((id) => [id, 0]));
      const attackHomeDen = new Map(teamIds.map((id) => [id, 0]));
      const attackAwayNum = new Map(teamIds.map((id) => [id, 0]));
      const attackAwayDen = new Map(teamIds.map((id) => [id, 0]));
      const defenceHomeNum = new Map(teamIds.map((id) => [id, 0]));
      const defenceHomeDen = new Map(teamIds.map((id) => [id, 0]));
      const defenceAwayNum = new Map(teamIds.map((id) => [id, 0]));
      const defenceAwayDen = new Map(teamIds.map((id) => [id, 0]));

      for (const fixture of matches) {
        const homeAttack = attackHome.get(fixture.team_h) ?? 1;
        const awayAttack = attackAway.get(fixture.team_a) ?? 1;
        const homeDefence = defenceHome.get(fixture.team_h) ?? 1;
        const awayDefence = defenceAway.get(fixture.team_a) ?? 1;

        attackHomeNum.set(fixture.team_h, (attackHomeNum.get(fixture.team_h) ?? 0) + fixture.team_h_score);
        attackHomeDen.set(
          fixture.team_h,
          (attackHomeDen.get(fixture.team_h) ?? 0) + average * awayDefence * advantage,
        );
        defenceHomeNum.set(fixture.team_h, (defenceHomeNum.get(fixture.team_h) ?? 0) + fixture.team_a_score);
        defenceHomeDen.set(
          fixture.team_h,
          (defenceHomeDen.get(fixture.team_h) ?? 0) + average * awayAttack,
        );
        attackAwayNum.set(fixture.team_a, (attackAwayNum.get(fixture.team_a) ?? 0) + fixture.team_a_score);
        attackAwayDen.set(
          fixture.team_a,
          (attackAwayDen.get(fixture.team_a) ?? 0) + average * homeDefence,
        );
        defenceAwayNum.set(fixture.team_a, (defenceAwayNum.get(fixture.team_a) ?? 0) + fixture.team_h_score);
        defenceAwayDen.set(
          fixture.team_a,
          (defenceAwayDen.get(fixture.team_a) ?? 0) + average * homeAttack * advantage,
        );
      }

      const apply = (target: Map<number, number>, numerator: Map<number, number>, denominator: Map<number, number>) => {
        for (const id of teamIds) {
          const den = denominator.get(id) ?? 0;
          const num = numerator.get(id) ?? 0;
          target.set(id, den > 0 ? clamp(num / den, 0.2, 4) : 1);
        }
      };
      apply(attackHome, attackHomeNum, attackHomeDen);
      apply(attackAway, attackAwayNum, attackAwayDen);
      apply(defenceHome, defenceHomeNum, defenceHomeDen);
      apply(defenceAway, defenceAwayNum, defenceAwayDen);

      const playedHome = teamIds.filter((id) => matches.some((fixture) => fixture.team_h === id));
      const playedAway = teamIds.filter((id) => matches.some((fixture) => fixture.team_a === id));
      normaliseRatingGroup(attackHome, playedHome);
      normaliseRatingGroup(defenceHome, playedHome);
      normaliseRatingGroup(attackAway, playedAway);
      normaliseRatingGroup(defenceAway, playedAway);
    }
  }

  return new Map(teamIds.map((id) => [id, {
    attackHome: attackHome.get(id) ?? 1,
    attackAway: attackAway.get(id) ?? 1,
    defenceHome: defenceHome.get(id) ?? 1,
    defenceAway: defenceAway.get(id) ?? 1,
  }]));
}

export function deriveAttackDefenceRatings(
  fixtures: FinishedFixtureRow[],
  teams: TeamRatingRow[],
  params: Pick<ForecastParams, "homeAdvantage" | "fplStrengthBlend">,
) {
  const stats = new Map<number, {
    homeGoalsFor: number;
    homeGoalsAgainst: number;
    awayGoalsFor: number;
    awayGoalsAgainst: number;
    homeMatches: number;
    awayMatches: number;
  }>();

  for (const team of teams) {
    stats.set(team.team_id, {
      homeGoalsFor: 0,
      homeGoalsAgainst: 0,
      awayGoalsFor: 0,
      awayGoalsAgainst: 0,
      homeMatches: 0,
      awayMatches: 0,
    });
  }

  for (const fixture of fixtures) {
    const home = stats.get(fixture.team_h);
    const away = stats.get(fixture.team_a);
    if (!home || !away) continue;
    home.homeGoalsFor += fixture.team_h_score;
    home.homeGoalsAgainst += fixture.team_a_score;
    home.homeMatches += 1;
    away.awayGoalsFor += fixture.team_a_score;
    away.awayGoalsAgainst += fixture.team_h_score;
    away.awayMatches += 1;
  }

  const totalGoals = fixtures.reduce((sum, fixture) => sum + fixture.team_h_score + fixture.team_a_score, 0);
  const totalMatches = fixtures.length;
  const leagueAverage = totalMatches > 0 ? totalGoals / (totalMatches * 2) : 1.35;
  const blend = clamp(params.fplStrengthBlend, 0, 1);
  const adjusted = estimateOpponentAdjustedRates(
    fixtures,
    teams.map((team) => team.team_id),
    params.homeAdvantage,
    leagueAverage,
  );

  const observed = teams.map((team) => {
    const record = stats.get(team.team_id)!;
    const rates = adjusted.get(team.team_id)!;
    return {
      team,
      record,
      attackHome: record.homeMatches ? rates.attackHome : 1,
      attackAway: record.awayMatches ? rates.attackAway : 1,
      defenceHome: record.homeMatches ? rates.defenceHome : 1,
      defenceAway: record.awayMatches ? rates.defenceAway : 1,
    };
  });

  const mix = (value: number, fplStrength: number | null) =>
    value * (1 - blend) + normaliseFplStrength(fplStrength) * blend;

  const strengths: TeamStrength[] = observed.map((row) => {
    const matchesPlayed = row.record.homeMatches + row.record.awayMatches;
    const mixedAttackHome = mix(row.attackHome, row.team.strength_attack_home);
    const mixedAttackAway = mix(row.attackAway, row.team.strength_attack_away);
    const mixedDefenceHome = mix(row.defenceHome, row.team.strength_defence_home);
    const mixedDefenceAway = mix(row.defenceAway, row.team.strength_defence_away);
    const attackOverallRaw = matchesPlayed
      ? (mixedAttackHome * row.record.homeMatches + mixedAttackAway * row.record.awayMatches) / matchesPlayed
      : (mixedAttackHome + mixedAttackAway) / 2;
    const defenceOverallRaw = matchesPlayed
      ? (mixedDefenceHome * row.record.homeMatches + mixedDefenceAway * row.record.awayMatches) / matchesPlayed
      : (mixedDefenceHome + mixedDefenceAway) / 2;
    const attackOverall = clamp(attackOverallRaw, 0.45, 2.2);
    const defenceOverall = clamp(defenceOverallRaw, 0.45, 2.2);
    const attackHome = clamp(mixedAttackHome, 0.45, 2.2);
    const attackAway = clamp(mixedAttackAway, 0.45, 2.2);
    const defenceHome = clamp(mixedDefenceHome, 0.45, 2.2);
    const defenceAway = clamp(mixedDefenceAway, 0.45, 2.2);

    return {
      teamId: row.team.team_id,
      name: row.team.name,
      shortName: row.team.short_name ?? row.team.name,
      attackHome,
      attackAway,
      defenceHome,
      defenceAway,
      attackOverall,
      defenceOverall,
      matchesPlayed,
    };
  });

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
