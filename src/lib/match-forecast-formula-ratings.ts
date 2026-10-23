import { FORMULA } from "@/lib/formula";
import type { FinishedFixtureRow, TeamRatingRow } from "@/lib/match-forecast-model";

export type PlayerFixtureFormulaRow = {
  team_id: number;
  was_home: boolean;
  xgi: number;
  attack_con: number;
  defcon: number;
  minutes: number;
  expected_goals_conceded: number;
};

type VenueBucket = {
  matchPoints: number[];
  scored: number[];
  conceded: number[];
  xgi: number;
  attackCon: number;
  defcon: number;
  xgc: number;
  minutes: number;
};

type DefenceSample = {
  key: string;
  concededRate: number;
  formulaDefenceRaw: number;
  defconPerMatch: number;
  xgcPerMatch: number;
  fplDefenceNorm: number;
};

function emptyBucket(): VenueBucket {
  return {
    matchPoints: [],
    scored: [],
    conceded: [],
    xgi: 0,
    attackCon: 0,
    defcon: 0,
    xgc: 0,
    minutes: 0,
  };
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
    home.matchPoints.push(matchPointsFor(fixture.team_h_score, fixture.team_a_score));
    home.scored.push(fixture.team_h_score);
    home.conceded.push(fixture.team_a_score);
    away.matchPoints.push(matchPointsFor(fixture.team_a_score, fixture.team_h_score));
    away.scored.push(fixture.team_a_score);
    away.conceded.push(fixture.team_h_score);
  }

  for (const row of playerRows) {
    const bucket = ensure(row.team_id, row.was_home);
    bucket.xgi += row.xgi;
    bucket.attackCon += row.attack_con;
    bucket.defcon += row.defcon;
    bucket.xgc += row.expected_goals_conceded;
    bucket.minutes += row.minutes;
  }

  return buckets;
}

/** Same structure as rankings team attack (T), scoped to home or away matches. */
export function teamFormulaAttackRaw(bucket: VenueBucket) {
  const matches = bucket.matchPoints.length;
  if (!matches) return 0;
  const avgPoints = bucket.matchPoints.reduce((sum, value) => sum + value, 0) / matches;
  const avgScored = bucket.scored.reduce((sum, value) => sum + value, 0) / matches;
  return (
    avgPoints +
    avgScored * FORMULA.teamGoals +
    bucket.xgi * FORMULA.teamXgi +
    bucket.attackCon * FORMULA.teamAttackCon
  );
}

/** Same structure as rankings team defence (T), scoped to home or away matches. */
export function teamFormulaDefenceRaw(bucket: VenueBucket) {
  const matches = bucket.conceded.length;
  if (!matches) return 0;
  const avgConceded = bucket.conceded.reduce((sum, value) => sum + value, 0) / matches;
  return (FORMULA.teamDefenceBase - avgConceded) + bucket.defcon * FORMULA.teamDefcon;
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
  const [b0, b1, b2, b3, b4] = coefficients;
  const predicted =
    b0! +
    b1! * sample.formulaDefenceRaw +
    b2! * sample.defconPerMatch +
    b3! * sample.xgcPerMatch +
    b4! * sample.fplDefenceNorm;
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
): Map<number, FormulaVenueMultipliers> {
  const blend = Math.min(Math.max(formulaBlend, 0), 1);
  const buckets = buildVenueBuckets(fixtures, playerRows);
  const leagueAvg = Math.max(leagueAverageGoals, 0.1);

  const attackRaws: number[] = [];
  const defenceSamples: DefenceSample[] = [];

  for (const team of teams) {
    for (const wasHome of [true, false]) {
      const bucket = buckets.get(venueKey(team.team_id, wasHome));
      if (!bucket || !bucket.matchPoints.length) continue;
      const matches = bucket.matchPoints.length;
      const attackRaw = teamFormulaAttackRaw(bucket);
      if (attackRaw > 0) attackRaws.push(attackRaw);

      defenceSamples.push({
        key: venueKey(team.team_id, wasHome),
        concededRate: bucket.conceded.reduce((sum, value) => sum + value, 0) / matches / leagueAvg,
        formulaDefenceRaw: teamFormulaDefenceRaw(bucket),
        defconPerMatch: bucket.defcon / matches,
        xgcPerMatch: bucket.xgc / matches,
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
            sample.formulaDefenceRaw,
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

    const goalsAttackHome = homeBucket?.matchPoints.length
      ? homeBucket.scored.reduce((sum, value) => sum + value, 0) / homeBucket.matchPoints.length / leagueAvg
      : 1;
    const goalsAttackAway = awayBucket?.matchPoints.length
      ? awayBucket.scored.reduce((sum, value) => sum + value, 0) / awayBucket.matchPoints.length / leagueAvg
      : 1;
    const goalsDefenceHome = homeBucket?.matchPoints.length
      ? homeBucket.conceded.reduce((sum, value) => sum + value, 0) / homeBucket.matchPoints.length / leagueAvg
      : 1;
    const goalsDefenceAway = awayBucket?.matchPoints.length
      ? awayBucket.conceded.reduce((sum, value) => sum + value, 0) / awayBucket.matchPoints.length / leagueAvg
      : 1;

    const formulaAttackHome = homeBucket?.matchPoints.length
      ? teamFormulaAttackRaw(homeBucket) / attackScale
      : goalsAttackHome;
    const formulaAttackAway = awayBucket?.matchPoints.length
      ? teamFormulaAttackRaw(awayBucket) / attackScale
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
