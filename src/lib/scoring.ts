import type {
  PlayerFeature,
  RankedPlayer,
  RankingParams,
  ScoreBreakdown,
  ScoreWeights,
} from "@/lib/fpl-types";

type RankingParamInput = Omit<Partial<RankingParams>, "weights"> & {
  weights?: Partial<ScoreWeights> & { venue?: unknown };
};

export const DEFAULT_PARAMS: RankingParams = {
  formWindow: 5,
  fixtureHorizon: 3,
  minMinutes: 0,
  weights: { individual: 45, team: 20, fixtures: 35 },
};

export const FORMULA_PRESETS = [
  {
    id: "balanced",
    name: "Balanced",
    description: "Equal emphasis on recent form and the next three Gameweeks.",
    formWindow: 5,
    fixtureHorizon: 3,
    weights: { individual: 45, team: 20, fixtures: 35 },
  },
  {
    id: "form-first",
    name: "Form first",
    description: "Prioritises players and teams that are performing now.",
    formWindow: 5,
    fixtureHorizon: 3,
    weights: { individual: 60, team: 25, fixtures: 15 },
  },
  {
    id: "fixture-led",
    name: "Fixture led",
    description: "Looks further ahead and gives the schedule the most influence.",
    formWindow: 3,
    fixtureHorizon: 5,
    weights: { individual: 25, team: 15, fixtures: 60 },
  },
  {
    id: "steady",
    name: "Steady",
    description: "Uses a longer form sample to reduce week-to-week swings.",
    formWindow: 8,
    fixtureHorizon: 4,
    weights: { individual: 50, team: 30, fixtures: 20 },
  },
] as const;

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function sanitiseParams(input: RankingParamInput = {}): RankingParams {
  const rawWeights = (input.weights ?? DEFAULT_PARAMS.weights) as Partial<ScoreWeights> & {
    venue?: unknown;
  };
  const weights: ScoreWeights = {
    individual: clamp(Number(rawWeights.individual) || 0, 0, 100),
    team: clamp(Number(rawWeights.team) || 0, 0, 100),
    fixtures: clamp(
      (Number(rawWeights.fixtures) || 0) + (Number(rawWeights.venue) || 0),
      0,
      100,
    ),
  };

  return {
    formWindow: clamp(Math.round(Number(input.formWindow) || DEFAULT_PARAMS.formWindow), 1, 10),
    fixtureHorizon: clamp(
      Math.round(Number(input.fixtureHorizon) || DEFAULT_PARAMS.fixtureHorizon),
      1,
      8,
    ),
    minMinutes: clamp(Math.round(Number(input.minMinutes) || DEFAULT_PARAMS.minMinutes), 0, 900),
    weights,
  };
}

function scale(values: number[]): (value: number) => number {
  const finite = values.filter(Number.isFinite);
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  if (!finite.length || low === high) return () => 50;
  return (value) => clamp(((value - low) / (high - low)) * 100, 0, 100);
}

function individualRaw(player: PlayerFeature) {
  const attacking = player.xg + player.xa;
  const defconWeight = player.position === "DEF" ? 1 : player.position === "MID" ? 0.55 : 0.15;
  const priorSeasonReference = player.lastSeasonXgiPer90 * 4 + player.lastSeasonPointsPer90;
  return (
    attacking * 0.55 +
    player.formPoints * 0.3 +
    player.defcon * defconWeight * 0.15 +
    priorSeasonReference * 0.25
  );
}

function teamRaw(player: PlayerFeature) {
  const defenceWeight = player.position === "GKP" || player.position === "DEF" ? 0.6 : 0.2;
  return player.teamAttack * (1 - defenceWeight) + player.teamDefence * defenceWeight;
}

function fixtureRaw(player: PlayerFeature) {
  if (!player.fixtures.length) return 0;
  return (
    player.fixtures.reduce(
      (sum, fixture) =>
        sum + (6 - fixture.difficulty + (fixture.wasHome ? 0.5 : -0.5)) * 20,
      0,
    ) /
    player.fixtures.length
  );
}

export function scorePlayers(
  players: PlayerFeature[],
  params: RankingParams = DEFAULT_PARAMS,
): RankedPlayer[] {
  const safeParams = sanitiseParams(params);
  const individualScale = scale(players.map(individualRaw));
  const teamScale = scale(players.map(teamRaw));
  const fixtureScale = scale(players.map(fixtureRaw));
  const totalWeight = Object.values(safeParams.weights).reduce((sum, weight) => sum + weight, 0) || 1;

  return players
    .filter((player) => player.minutes >= safeParams.minMinutes)
    .map((player) => {
      const breakdown: ScoreBreakdown = {
        individual: individualScale(individualRaw(player)),
        team: teamScale(teamRaw(player)),
        fixtures: fixtureScale(fixtureRaw(player)),
      };
      const score =
        (breakdown.individual * safeParams.weights.individual +
          breakdown.team * safeParams.weights.team +
          breakdown.fixtures * safeParams.weights.fixtures) /
        totalWeight;

      return { ...player, score: Number(score.toFixed(1)), breakdown };
    })
    .sort((left, right) => right.score - left.score || right.xg + right.xa - (left.xg + left.xa))
    .map((player, index) => ({ ...player, rank: index + 1 }));
}
