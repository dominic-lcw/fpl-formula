import type { PlayerFeature } from "@/lib/fpl-types";

/**
 * Individual-form scale.
 *
 * Defensive contribution is a raw action count. A centre-back can post 80–120
 * actions across a five-game window, while xG + xA for a forward is usually
 * 2–5 and threat + creativity a few hundred. The previous formula multiplied
 * that count by 0.15 and again by 1.0 for defenders (0.55 for midfielders),
 * so DefCon alone could outweigh FPL points and attacking output.
 *
 * Each term below is calibrated so a strong five-game sample lands near 3–4
 * raw points: about 3 xGI, ~300 threat+creativity, or ~90 defensive actions.
 * FPL points stay the largest term because they are the realised return.
 * Official FPL bonus is left inside those points. The bonus term is a separate
 * 3-point award we assign once per fixture. The previous-season reference is
 * weighted at 10%.
 */
export const FORMULA = {
  xgi: 1,
  formPoints: 0.3,
  attackCon: 0.012,
  defcon: 0.04,
  bonus: 1,
  priorXgiScale: 4,
  priorWeight: 0.1,
  bonusAward: 3,
  bonusClaimXgi: 25,
  bonusClaimAttack: 0.08,
  bonusClaimDefcon: 0.35,
  teamGoals: 0.35,
  teamXgi: 0.1,
  teamAttackCon: 0.0004,
  teamDefcon: 0.005,
  teamDefenceBase: 3,
} as const;

export type BonusClaimInput = {
  xg: number;
  xa: number;
  threat: number;
  creativity: number;
  defcon: number;
};

export function attackContribution(threat: number, creativity: number) {
  return threat + creativity;
}

/** Per-fixture claim used only to choose who receives the 3-point award. */
export function matchBonusClaim(input: BonusClaimInput) {
  return (
    (input.xg + input.xa) * FORMULA.bonusClaimXgi +
    attackContribution(input.threat, input.creativity) * FORMULA.bonusClaimAttack +
    input.defcon * FORMULA.bonusClaimDefcon
  );
}

export function individualRaw(player: Pick<
  PlayerFeature,
  "xg" | "xa" | "formPoints" | "attackCon" | "defcon" | "bonusPoints" | "lastSeasonXgiPer90" | "lastSeasonPointsPer90"
>) {
  const priorSeasonReference = player.lastSeasonXgiPer90 * FORMULA.priorXgiScale + player.lastSeasonPointsPer90;
  return (
    (player.xg + player.xa) * FORMULA.xgi +
    player.formPoints * FORMULA.formPoints +
    player.attackCon * FORMULA.attackCon +
    player.defcon * FORMULA.defcon +
    player.bonusPoints * FORMULA.bonus +
    priorSeasonReference * FORMULA.priorWeight
  );
}

export function teamRaw(player: Pick<PlayerFeature, "position" | "teamAttack" | "teamDefence">) {
  const defenceWeight = player.position === "GKP" || player.position === "DEF" ? 0.6 : 0.2;
  return player.teamAttack * (1 - defenceWeight) + player.teamDefence * defenceWeight;
}

export function fixtureRaw(player: Pick<PlayerFeature, "fixtures">) {
  if (!player.fixtures.length) return 0;
  return (
    player.fixtures.reduce(
      (sum, fixture) => sum + (6 - fixture.difficulty + (fixture.wasHome ? 0.5 : -0.5)) * 20,
      0,
    ) / player.fixtures.length
  );
}

export function individualRawSql(alias: string) {
  return `(${alias}.xg + ${alias}.xa) * ${FORMULA.xgi}
          + ${alias}.form_points * ${FORMULA.formPoints}
          + ${alias}.attack_con * ${FORMULA.attackCon}
          + ${alias}.defcon * ${FORMULA.defcon}
          + ${alias}.bonus_points * ${FORMULA.bonus}
          + (${alias}.last_year_xgi_per_90 * ${FORMULA.priorXgiScale} + ${alias}.last_year_per_90) * ${FORMULA.priorWeight}`;
}

export function attackConSumSql(alias: string) {
  return `coalesce(sum(coalesce(${alias}.threat, 0) + coalesce(${alias}.creativity, 0)), 0)`;
}

export function bonusPointsSumSql(alias: string) {
  return `coalesce(sum(${alias}.bonus_points), 0)`;
}

export function teamAttackSelectSql() {
  return `avg(m.points) + avg(m.scored) * ${FORMULA.teamGoals} + coalesce(max(p.xgi), 0) * ${FORMULA.teamXgi} + coalesce(max(p.attack_con), 0) * ${FORMULA.teamAttackCon}`;
}

export function teamDefenceSelectSql() {
  return `(${FORMULA.teamDefenceBase} - avg(m.conceded)) + coalesce(max(p.defcon), 0) * ${FORMULA.teamDefcon}`;
}

export function teamRawSql(position: string, attack: string, defence: string) {
  return `coalesce(${attack}, 0) * CASE WHEN ${position} IN ('GKP', 'DEF') THEN 0.4 ELSE 0.8 END
          + coalesce(${defence}, 0) * CASE WHEN ${position} IN ('GKP', 'DEF') THEN 0.6 ELSE 0.2 END`;
}

export function bonusClaimSql(alias: string) {
  return `(
            (coalesce(${alias}.expected_goals, 0) + coalesce(${alias}.expected_assists, 0)) * ${FORMULA.bonusClaimXgi}
            + (coalesce(${alias}.threat, 0) + coalesce(${alias}.creativity, 0)) * ${FORMULA.bonusClaimAttack}
            + coalesce(${alias}.defensive_contribution, 0) * ${FORMULA.bonusClaimDefcon}
          )`;
}

/** One row per fixture: the player with the highest match claim receives 3 points. */
export function fixtureBonusSubquerySql() {
  return `
    SELECT season, fixture_id, player_id, ${FORMULA.bonusAward} AS bonus_points
    FROM (
      SELECT
        season,
        fixture_id,
        player_id,
        row_number() OVER (
          PARTITION BY season, fixture_id
          ORDER BY
            ${bonusClaimSql("stats")} DESC,
            (coalesce(stats.expected_goals, 0) + coalesce(stats.expected_assists, 0)) DESC,
            (coalesce(stats.threat, 0) + coalesce(stats.creativity, 0)) DESC,
            stats.player_id
        ) AS bonus_rank
      FROM player_fixture_stats stats
      WHERE coalesce(stats.minutes, 0) > 0
    ) ranked_bonus
    WHERE bonus_rank = 1
  `;
}

export const INDIVIDUAL_FORMULA_TEXT =
  `(xG + xA) × ${FORMULA.xgi} + FPL points × ${FORMULA.formPoints} + AtkCon × ${FORMULA.attackCon} + DefCon × ${FORMULA.defcon} + bonus × ${FORMULA.bonus} + (last-season xGI/90 × ${FORMULA.priorXgiScale} + last-season points/90) × ${FORMULA.priorWeight}`;

export const INDIVIDUAL_FORMULA_NOTE =
  `AtkCon is threat + creativity over the form window. DefCon is the defensive-action count on the same scale, with no extra position multiplier. Bonus adds ${FORMULA.bonusAward} points for the player with the highest match claim in each fixture: (xG + xA) × ${FORMULA.bonusClaimXgi} + AtkCon × ${FORMULA.bonusClaimAttack} + DefCon × ${FORMULA.bonusClaimDefcon}. That award is separate from total FPL points.`;

export const TEAM_FORMULA_NOTE =
  `Attack = avg match points + avg goals scored × ${FORMULA.teamGoals} + team xGI × ${FORMULA.teamXgi} + team AtkCon × ${FORMULA.teamAttackCon}. Defence = ${FORMULA.teamDefenceBase} − avg goals conceded + team DefCon × ${FORMULA.teamDefcon}. GKP/DEF use 0.40 attack + 0.60 defence; MID/FWD use 0.80 + 0.20.`;
