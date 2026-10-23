import { FORMULA } from "@/lib/formula";
import type { AttackDefenceVenue } from "@/lib/match-forecast-matrix";
import { estimateAttackDefenceMatrix } from "@/lib/match-forecast-matrix";
import type { FinishedFixtureRow, TeamRatingRow } from "@/lib/match-forecast-model";

export type PlayerFixtureFormulaRow = {
  team_id: number;
  was_home: boolean;
  event: number;
  xgi: number;
  attack_con: number;
  defcon: number;
  minutes: number;
  expected_goals_conceded: number;
};

export type ForecastSampleOptions = {
  attackGoalsCap: number;
};

type VenueBucket = {
  weightSum: number;
  weightedPoints: number;
  weightedScored: number;
  weightedScoredForAttack: number;
  weightedConceded: number;
  xgi: number;
  attackCon: number;
  defcon: number;
  xgc: number;
  minutes: number;
  playerWeightSum: number;
};

type DefenceSample = {
  key: string;
  concededRate: number;
  defconPerMatch: number;
  xgcPerMatch: number;
  fplDefenceNorm: number;
};

function emptyBucket(): VenueBucket {
  return {
    weightSum: 0,
    weightedPoints: 0,
    weightedScored: 0,
    weightedScoredForAttack: 0,
    weightedConceded: 0,
    xgi: 0,
    attackCon: 0,
    defcon: 0,
    xgc: 0,
    minutes: 0,
    playerWeightSum: 0,
  };
}

export function capGoalsForAttackRate(goals: number, cap: number) {
  if (!cap || cap <= 0) return goals;
  return Math.min(goals, cap);
}

function matchPointsFor(teamScore: number, oppScore: number) {
  if (teamScore > oppScore) return 3;
  if (teamScore === oppScore) return 1;
  return 0;
}

export function venueKey(teamId: number, wasHome: boolean) {
  return `${teamId}:${wasHome ? "H" : "A"}`;
}

export function buildVenueBuckets(
  fixtures: FinishedFixtureRow[],
  playerRows: PlayerFixtureFormulaRow[],
  options: ForecastSampleOptions,
) {
  const buckets = new Map<string, VenueBucket>();

  const ensure = (teamId: number, wasHome: boolean) => {
    const key = venueKey(teamId, wasHome);
    if (!buckets.has(key)) buckets.set(key, emptyBucket());
    return buckets.get(key)!;
  };

  for (const fixture of fixtures) {
    const home = ensure(fixture.team_h, true);
    const away = ensure(fixture.team_a, false);
    const homeAttackGoals = capGoalsForAttackRate(fixture.team_h_score, options.attackGoalsCap);
    const awayAttackGoals = capGoalsForAttackRate(fixture.team_a_score, options.attackGoalsCap);

    home.weightSum += 1;
    home.weightedPoints += matchPointsFor(fixture.team_h_score, fixture.team_a_score);
    home.weightedScored += fixture.team_h_score;
    home.weightedScoredForAttack += homeAttackGoals;
    home.weightedConceded += fixture.team_a_score;

    away.weightSum += 1;
    away.weightedPoints += matchPointsFor(fixture.team_a_score, fixture.team_h_score);
    away.weightedScored += fixture.team_a_score;
    away.weightedScoredForAttack += awayAttackGoals;
    away.weightedConceded += fixture.team_h_score;
  }

  for (const row of playerRows) {
    const bucket = ensure(row.team_id, row.was_home);
    bucket.xgi += row.xgi;
    bucket.attackCon += row.attack_con;
    bucket.defcon += row.defcon;
    bucket.xgc += row.expected_goals_conceded;
    bucket.minutes += row.minutes;
    bucket.playerWeightSum += 1;
  }

  return buckets;
}

function bucketMatchWeight(bucket: VenueBucket) {
  return bucket.weightSum > 0 ? bucket.weightSum : 0;
}

/**
 * Forecast attack index. Goals come from the solved match matrix (already
 * opponent-adjusted), not from raw points or raw goals. xGI and AtkCon stay
 * as process evidence.
 */
export function forecastFormulaAttackRaw(bucket: VenueBucket, adjustedGoalsPerMatch: number) {
  if (!bucketMatchWeight(bucket)) return 0;
  return (
    adjustedGoalsPerMatch * (1 + FORMULA.teamGoals) +
    bucket.xgi * FORMULA.teamXgi +
    bucket.attackCon * FORMULA.teamAttackCon
  );
}

/** Same structure as rankings team attack (T), scoped to home or away matches. */
export function teamFormulaAttackRaw(bucket: VenueBucket) {
  const weight = bucketMatchWeight(bucket);
  if (!weight) return 0;
  const avgPoints = bucket.weightedPoints / weight;
  const avgScored = bucket.weightedScoredForAttack / weight;
  return (
    avgPoints +
    avgScored * FORMULA.teamGoals +
    bucket.xgi * FORMULA.teamXgi +
    bucket.attackCon * FORMULA.teamAttackCon
  );
}

/** Same structure as rankings team defence (T), scoped to home or away matches. */
export function teamFormulaDefenceRaw(bucket: VenueBucket) {
  const weight = bucketMatchWeight(bucket);
  if (!weight) return 0;
  const avgConceded = bucket.weightedConceded / weight;
  return (FORMULA.teamDefenceBase - avgConceded) + bucket.defcon * FORMULA.teamDefcon;
}

export function weightedAttackRate(bucket: VenueBucket, leagueAverageGoals: number) {
  const weight = bucketMatchWeight(bucket);
  if (!weight) return 1;
  const leagueAvg = Math.max(leagueAverageGoals, 0.1);
  return bucket.weightedScoredForAttack / weight / leagueAvg;
}

function meanPositive(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!finite.length) return 1;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

/** Ridge regression: beta = (X'X + λI)^(-1) X'y */
export function ridgeRegression(design: number[][], targets: number[], ridge = 0.75) {
  const n = design.length;
  const p = design[0]?.length ?? 0;
  if (n < p + 2) return null;

  const xtx = Array.from({ length: p }, () => Array(p).fill(0));
  const xty = Array(p).fill(0);

  for (let i = 0; i < n; i += 1) {
    const row = design[i]!;
    const y = targets[i]!;
    for (let j = 0; j < p; j += 1) {
      xty[j] += row[j]! * y;
      for (let k = 0; k < p; k += 1) {
        xtx[j]![k]! += row[j]! * row[k]!;
      }
    }
  }

  for (let d = 0; d < p; d += 1) {
    xtx[d]![d]! += ridge;
  }

  return solveSymmetric(xtx, xty);
}

function solveSymmetric(matrix: number[][], rhs: number[]) {
  const n = rhs.length;
  const a = matrix.map((row) => [...row]);
  const b = [...rhs];

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    [b[col], b[pivot]] = [b[pivot]!, b[col]!];

    const div = a[col]![col]!;
    for (let j = col; j < n; j += 1) a[col]![j]! /= div;
    b[col]! /= div;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row]![col]!;
      for (let j = col; j < n; j += 1) a[row]![j]! -= factor * a[col]![j]!;
      b[row]! -= factor * b[col]!;
    }
  }

  return b;
}

function predictDefenceConcededRate(coefficients: number[], sample: DefenceSample) {
  const [b0, b1, b2, b3] = coefficients;
  const predicted =
    b0! +
    b1! * sample.defconPerMatch +
    b2! * sample.xgcPerMatch +
    b3! * sample.fplDefenceNorm;
  return Math.max(0.35, Math.min(2.4, predicted));
}

function normaliseFplStrength(value: number | null, baseline = 1000) {
  if (!value || !Number.isFinite(value)) return 1;
  return Math.min(Math.max(value / baseline, 0.65), 1.35);
}

export type FormulaVenueMultipliers = {
  attackHome: number;
  attackAway: number;
  defenceHome: number;
  defenceAway: number;
};

export function buildFormulaVenueMultipliers(
  fixtures: FinishedFixtureRow[],
  teams: TeamRatingRow[],
  playerRows: PlayerFixtureFormulaRow[],
  leagueAverageGoals: number,
  formulaBlend: number,
  sampleOptions: ForecastSampleOptions,
  matrix?: Map<number, AttackDefenceVenue>,
): Map<number, FormulaVenueMultipliers> {
  const blend = Math.min(Math.max(formulaBlend, 0), 1);
  const buckets = buildVenueBuckets(fixtures, playerRows, sampleOptions);
  const leagueAvg = Math.max(leagueAverageGoals, 0.1);
  const solved = matrix ?? estimateAttackDefenceMatrix(
    fixtures,
    teams.map((team) => team.team_id),
    leagueAverageGoals,
    sampleOptions.attackGoalsCap,
  );

  const attackRaws: number[] = [];
  const defenceSamples: DefenceSample[] = [];

  for (const team of teams) {
    const rates = solved.get(team.team_id);
    for (const wasHome of [true, false]) {
      const bucket = buckets.get(venueKey(team.team_id, wasHome));
      if (!bucket || !bucketMatchWeight(bucket)) continue;
      const weight = bucketMatchWeight(bucket);
      const attackMultiplier = wasHome ? rates?.attackHome ?? 1 : rates?.attackAway ?? 1;
      const attackRaw = forecastFormulaAttackRaw(bucket, attackMultiplier * leagueAvg);
      if (attackRaw > 0) attackRaws.push(attackRaw);

      defenceSamples.push({
        key: venueKey(team.team_id, wasHome),
        concededRate: wasHome ? rates?.defenceHome ?? 1 : rates?.defenceAway ?? 1,
        defconPerMatch: bucket.defcon / Math.max(weight, 1),
        xgcPerMatch: bucket.xgc / Math.max(weight, 1),
        fplDefenceNorm: normaliseFplStrength(
          wasHome ? team.strength_defence_home : team.strength_defence_away,
        ),
      });
    }
  }

  const attackScale = meanPositive(attackRaws);
  const defenceCoefficients =
    defenceSamples.length >= 8
      ? ridgeRegression(
          defenceSamples.map((sample) => [
            1,
            sample.defconPerMatch,
            sample.xgcPerMatch,
            sample.fplDefenceNorm,
          ]),
          defenceSamples.map((sample) => sample.concededRate),
        )
      : null;

  const regressedDefence = new Map<string, number>();
  for (const sample of defenceSamples) {
    if (defenceCoefficients) {
      regressedDefence.set(sample.key, predictDefenceConcededRate(defenceCoefficients, sample));
    }
  }

  const result = new Map<number, FormulaVenueMultipliers>();

  for (const team of teams) {
    const homeBucket = buckets.get(venueKey(team.team_id, true));
    const awayBucket = buckets.get(venueKey(team.team_id, false));
    const rates = solved.get(team.team_id);

    const goalsAttackHome = homeBucket && bucketMatchWeight(homeBucket)
      ? rates?.attackHome ?? 1
      : 1;
    const goalsAttackAway = awayBucket && bucketMatchWeight(awayBucket)
      ? rates?.attackAway ?? 1
      : 1;
    const goalsDefenceHome = homeBucket && bucketMatchWeight(homeBucket)
      ? rates?.defenceHome ?? 1
      : 1;
    const goalsDefenceAway = awayBucket && bucketMatchWeight(awayBucket)
      ? rates?.defenceAway ?? 1
      : 1;

    const formulaAttackHome = homeBucket && bucketMatchWeight(homeBucket)
      ? forecastFormulaAttackRaw(homeBucket, goalsAttackHome * leagueAvg) / attackScale
      : goalsAttackHome;
    const formulaAttackAway = awayBucket && bucketMatchWeight(awayBucket)
      ? forecastFormulaAttackRaw(awayBucket, goalsAttackAway * leagueAvg) / attackScale
      : goalsAttackAway;

    const homeDefenceKey = venueKey(team.team_id, true);
    const awayDefenceKey = venueKey(team.team_id, false);
    const regressedHome = regressedDefence.get(homeDefenceKey);
    const regressedAway = regressedDefence.get(awayDefenceKey);

    const defenceHome =
      regressedHome != null
        ? (1 - blend) * goalsDefenceHome + blend * regressedHome
        : goalsDefenceHome;
    const defenceAway =
      regressedAway != null
        ? (1 - blend) * goalsDefenceAway + blend * regressedAway
        : goalsDefenceAway;

    result.set(team.team_id, {
      attackHome: (1 - blend) * goalsAttackHome + blend * formulaAttackHome,
      attackAway: (1 - blend) * goalsAttackAway + blend * formulaAttackAway,
      defenceHome,
      defenceAway,
    });
  }

  return result;
}
