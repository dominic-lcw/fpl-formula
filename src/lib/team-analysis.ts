import type { Position, RankedPlayer, RankingResponse } from "@/lib/fpl-types";

export type FplPick = {
  element: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  multiplier: number;
};

export type TeamMemberScore = RankedPlayer & {
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
};

export type TeamAnalysis = {
  members: TeamMemberScore[];
  averageScore: number | null;
  suggestions: Record<Position, RankedPlayer[]>;
};

const positions: Position[] = ["GKP", "DEF", "MID", "FWD"];

function recommendedPlayers(
  rankings: RankedPlayer[],
  squadIds: Set<number>,
  position: Position,
) {
  const available = rankings.filter(
    (player) =>
      player.position === position &&
      !squadIds.has(player.playerId) &&
      player.status === "a" &&
      (player.chanceOfPlaying === null || player.chanceOfPlaying >= 75),
  );

  return available.slice(0, 3);
}

export function buildTeamAnalysis(
  rankingData: RankingResponse,
  picks: FplPick[],
): TeamAnalysis {
  const playersById = new Map(rankingData.rankings.map((player) => [player.playerId, player]));
  const squadIds = new Set(picks.map((pick) => pick.element));
  const members = picks
    .map((pick) => {
      const player = playersById.get(pick.element);
      return player
        ? {
            ...player,
            isCaptain: pick.is_captain,
            isViceCaptain: pick.is_vice_captain,
            multiplier: pick.multiplier,
          }
        : null;
    })
    .filter((player): player is TeamMemberScore => player !== null)
    .sort((left, right) => right.score - left.score);

  return {
    members,
    averageScore: members.length
      ? Number((members.reduce((total, player) => total + player.score, 0) / members.length).toFixed(1))
      : null,
    suggestions: Object.fromEntries(
      positions.map((position) => [position, recommendedPlayers(rankingData.rankings, squadIds, position)]),
    ) as Record<Position, RankedPlayer[]>,
  };
}
