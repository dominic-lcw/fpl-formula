type MatrixFixture = {
  team_h: number;
  team_a: number;
  team_h_score: number;
  team_a_score: number;
  /** Difficulty the home team faces. This is the away team's FDR class. */
  team_h_difficulty?: number | null;
  /** Difficulty the away team faces. This is the home team's FDR class. */
  team_a_difficulty?: number | null;
};

/**
 * Venue attack and defence multipliers.
 * Defence is leakiness: higher means opponents score more.
 */
export type AttackDefenceVenue = {
  attackHome: number;
  attackAway: number;
  defenceHome: number;
  defenceAway: number;
};

const ITERATIONS = 24;
const RATING_FLOOR = 0.2;
const RATING_CEILING = 4;
/** Each FDR step away from 3 moves attack and defence by this much. */
export const FDR_CLASS_STEP = 0.12;

export type FdrClass = {
  fdr: number;
  /** Scoring multiplier. Higher FDR is a stronger attack. */
  attack: number;
  /** Leakiness multiplier. Higher FDR is a tighter defence. */
  defence: number;
};

export function fdrClassFactors(fdr: number | null | undefined): FdrClass {
  const klass = clamp(Math.round(Number.isFinite(fdr) ? Number(fdr) : 3), 1, 5);
  return {
    fdr: klass,
    attack: 1 + (klass - 3) * FDR_CLASS_STEP,
    defence: 1 - (klass - 3) * FDR_CLASS_STEP,
  };
}

function modeFdr(values: number[]) {
  if (!values.length) return 3;
  const counts = new Map<number, number>();
  for (const value of values) {
    const klass = fdrClassFactors(value).fdr;
    counts.set(klass, (counts.get(klass) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]![0];
}

/** FDR a team presents at home and away: the difficulty its opponent is assigned. */
export function classifyTeamsByFdr(
  fixtures: Array<Pick<MatrixFixture, "team_h" | "team_a" | "team_h_difficulty" | "team_a_difficulty">>,
  teamIds: number[],
) {
  const home = new Map<number, number[]>();
  const away = new Map<number, number[]>();
  for (const teamId of teamIds) {
    home.set(teamId, []);
    away.set(teamId, []);
  }
  for (const fixture of fixtures) {
    if (fixture.team_a_difficulty != null && home.has(fixture.team_h)) {
      home.get(fixture.team_h)!.push(fixture.team_a_difficulty);
    }
    if (fixture.team_h_difficulty != null && away.has(fixture.team_a)) {
      away.get(fixture.team_a)!.push(fixture.team_h_difficulty);
    }
  }
  return new Map(teamIds.map((teamId) => [teamId, {
    home: modeFdr(home.get(teamId) ?? []),
    away: modeFdr(away.get(teamId) ?? []),
  }]));
}

function fixtureHasFdr(fixtures: MatrixFixture[]) {
  return fixtures.some((fixture) => fixture.team_h_difficulty != null && fixture.team_a_difficulty != null);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function capGoals(goals: number, cap: number) {
  if (!cap || cap <= 0) return goals;
  return Math.min(goals, cap);
}

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
 * Solve the match matrix
 *
 *   home goals(i, j) ≈ league avg × attackHome(i) × defenceAway(j)
 *   away goals(i, j) ≈ league avg × attackAway(j) × defenceHome(i)
 *
 * When fixtures carry FPL FDR, the opponent term is that class rather than a
 * rating solved from the same goals. FDR 3 is average. A higher class is a
 * stronger attack and a tighter defence, so the same scoreline against an FDR 5
 * side moves a rating less than it does against an FDR 2 side.
 *
 * Without FDR, alternating Poisson updates infer the opponent term from results.
 * Each group's geometric mean is fixed at 1. Home advantage is applied later,
 * only on λ_home. Attack numerators use the per-match goals cap. Defence uses
 * the goals actually conceded.
 */
function estimateAgainstFdrClass(
  matches: MatrixFixture[],
  teamIds: number[],
  leagueAverage: number,
  attackGoalsCap: number,
): Map<number, AttackDefenceVenue> {
  const attackHomeNum = new Map(teamIds.map((id) => [id, 0]));
  const attackHomeDen = new Map(teamIds.map((id) => [id, 0]));
  const attackAwayNum = new Map(teamIds.map((id) => [id, 0]));
  const attackAwayDen = new Map(teamIds.map((id) => [id, 0]));
  const defenceHomeNum = new Map(teamIds.map((id) => [id, 0]));
  const defenceHomeDen = new Map(teamIds.map((id) => [id, 0]));
  const defenceAwayNum = new Map(teamIds.map((id) => [id, 0]));
  const defenceAwayDen = new Map(teamIds.map((id) => [id, 0]));

  for (const fixture of matches) {
    const homeClass = fdrClassFactors(fixture.team_a_difficulty);
    const awayClass = fdrClassFactors(fixture.team_h_difficulty);
    const homeGoalsForAttack = capGoals(fixture.team_h_score, attackGoalsCap);
    const awayGoalsForAttack = capGoals(fixture.team_a_score, attackGoalsCap);

    attackHomeNum.set(fixture.team_h, (attackHomeNum.get(fixture.team_h) ?? 0) + homeGoalsForAttack);
    attackHomeDen.set(fixture.team_h, (attackHomeDen.get(fixture.team_h) ?? 0) + leagueAverage * awayClass.defence);
    defenceHomeNum.set(fixture.team_h, (defenceHomeNum.get(fixture.team_h) ?? 0) + fixture.team_a_score);
    defenceHomeDen.set(fixture.team_h, (defenceHomeDen.get(fixture.team_h) ?? 0) + leagueAverage * awayClass.attack);

    attackAwayNum.set(fixture.team_a, (attackAwayNum.get(fixture.team_a) ?? 0) + awayGoalsForAttack);
    attackAwayDen.set(fixture.team_a, (attackAwayDen.get(fixture.team_a) ?? 0) + leagueAverage * homeClass.defence);
    defenceAwayNum.set(fixture.team_a, (defenceAwayNum.get(fixture.team_a) ?? 0) + fixture.team_h_score);
    defenceAwayDen.set(fixture.team_a, (defenceAwayDen.get(fixture.team_a) ?? 0) + leagueAverage * homeClass.attack);
  }

  const attackHome = new Map(teamIds.map((id) => [id, 1]));
  const attackAway = new Map(teamIds.map((id) => [id, 1]));
  const defenceHome = new Map(teamIds.map((id) => [id, 1]));
  const defenceAway = new Map(teamIds.map((id) => [id, 1]));
  const apply = (target: Map<number, number>, numerator: Map<number, number>, denominator: Map<number, number>) => {
    for (const id of teamIds) {
      const den = denominator.get(id) ?? 0;
      const num = numerator.get(id) ?? 0;
      if (den > 0) target.set(id, clamp(num / den, RATING_FLOOR, RATING_CEILING));
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

  return new Map(teamIds.map((id) => [id, {
    attackHome: attackHome.get(id) ?? 1,
    attackAway: attackAway.get(id) ?? 1,
    defenceHome: defenceHome.get(id) ?? 1,
    defenceAway: defenceAway.get(id) ?? 1,
  }]));
}

export function estimateAttackDefenceMatrix(
  fixtures: MatrixFixture[],
  teamIds: number[],
  leagueAverage: number,
  attackGoalsCap = 0,
): Map<number, AttackDefenceVenue> {
  const attackHome = new Map(teamIds.map((id) => [id, 1]));
  const attackAway = new Map(teamIds.map((id) => [id, 1]));
  const defenceHome = new Map(teamIds.map((id) => [id, 1]));
  const defenceAway = new Map(teamIds.map((id) => [id, 1]));
  const known = new Set(teamIds);
  const matches = fixtures.filter((fixture) => known.has(fixture.team_h) && known.has(fixture.team_a));
  const average = leagueAverage > 0 ? leagueAverage : 1.35;

  if (fixtureHasFdr(matches)) {
    return estimateAgainstFdrClass(matches, teamIds, average, attackGoalsCap);
  }

  if (matches.length) {
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
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
        const homeGoalsForAttack = capGoals(fixture.team_h_score, attackGoalsCap);
        const awayGoalsForAttack = capGoals(fixture.team_a_score, attackGoalsCap);

        attackHomeNum.set(fixture.team_h, (attackHomeNum.get(fixture.team_h) ?? 0) + homeGoalsForAttack);
        attackHomeDen.set(fixture.team_h, (attackHomeDen.get(fixture.team_h) ?? 0) + average * awayDefence);
        defenceHomeNum.set(fixture.team_h, (defenceHomeNum.get(fixture.team_h) ?? 0) + fixture.team_a_score);
        defenceHomeDen.set(fixture.team_h, (defenceHomeDen.get(fixture.team_h) ?? 0) + average * awayAttack);

        attackAwayNum.set(fixture.team_a, (attackAwayNum.get(fixture.team_a) ?? 0) + awayGoalsForAttack);
        attackAwayDen.set(fixture.team_a, (attackAwayDen.get(fixture.team_a) ?? 0) + average * homeDefence);
        defenceAwayNum.set(fixture.team_a, (defenceAwayNum.get(fixture.team_a) ?? 0) + fixture.team_h_score);
        defenceAwayDen.set(fixture.team_a, (defenceAwayDen.get(fixture.team_a) ?? 0) + average * homeAttack);
      }

      const apply = (target: Map<number, number>, numerator: Map<number, number>, denominator: Map<number, number>) => {
        for (const id of teamIds) {
          const den = denominator.get(id) ?? 0;
          const num = numerator.get(id) ?? 0;
          if (den > 0) target.set(id, clamp(num / den, RATING_FLOOR, RATING_CEILING));
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
