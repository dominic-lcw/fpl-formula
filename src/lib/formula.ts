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
 * FPL points stay the largest term because they are the realised return,
 * including official FPL bonus (0–3) from BPS.
 */
export const FORMULA = {
  xgi: 1,
  formPoints: 0.3,
  attackCon: 0.012,
  defcon: 0.04,
  priorXgiScale: 4,
  priorWeight: 0.25,
  teamGoals: 0.35,
  teamXgi: 0.1,
  teamAttackCon: 0.0004,
  teamDefcon: 0.005,
  teamDefenceBase: 3,
} as const;

export function attackContribution(threat: number, creativity: number) {
  return threat + creativity;
}

export function individualRaw(player: Pick<
  PlayerFeature,
  "xg" | "xa" | "formPoints" | "attackCon" | "defcon" | "lastSeasonXgiPer90" | "lastSeasonPointsPer90"
>) {
  const priorSeasonReference = player.lastSeasonXgiPer90 * FORMULA.priorXgiScale + player.lastSeasonPointsPer90;
  return (
    (player.xg + player.xa) * FORMULA.xgi +
    player.formPoints * FORMULA.formPoints +
    player.attackCon * FORMULA.attackCon +
    player.defcon * FORMULA.defcon +
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
          + (${alias}.last_year_xgi_per_90 * ${FORMULA.priorXgiScale} + ${alias}.last_year_per_90) * ${FORMULA.priorWeight}`;
}

export function attackConSumSql(alias: string) {
  return `coalesce(sum(coalesce(${alias}.threat, 0) + coalesce(${alias}.creativity, 0)), 0)`;
}

/** Official FPL bonus (0–3 per fixture) summed over the form window — display only, already in FPL points. */
export function fplBonusSumSql(alias: string) {
  return `coalesce(sum(coalesce(${alias}.bonus, 0)), 0)`;
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

export const INDIVIDUAL_FORMULA_TEXT =
  `(xG + xA) × ${FORMULA.xgi} + FPL points × ${FORMULA.formPoints} + AtkCon × ${FORMULA.attackCon} + DefCon × ${FORMULA.defcon} + (last-season xGI/90 × ${FORMULA.priorXgiScale} + last-season points/90) × ${FORMULA.priorWeight}`;

export const INDIVIDUAL_FORMULA_NOTE =
  `AtkCon is threat + creativity over the form window. DefCon is the defensive-action count on the same scale, with no extra position multiplier. FPL points are total_points from the API, which already include official bonus from BPS.`;

export const TEAM_FORMULA_NOTE =
  `Attack = avg match points + avg goals scored × ${FORMULA.teamGoals} + team xGI × ${FORMULA.teamXgi} + team AtkCon × ${FORMULA.teamAttackCon}. Defence = ${FORMULA.teamDefenceBase} − avg goals conceded + team DefCon × ${FORMULA.teamDefcon}. GKP/DEF use 0.40 attack + 0.60 defence; MID/FWD use 0.80 + 0.20.`;
