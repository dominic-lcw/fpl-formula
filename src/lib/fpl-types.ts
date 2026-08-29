export const positions = ["GKP", "DEF", "MID", "FWD"] as const;

export type Position = (typeof positions)[number];

export type ScoreWeights = {
  individual: number;
  team: number;
  fixtures: number;
  venue: number;
};

export type RankingParams = {
  formWindow: number;
  fixtureHorizon: number;
  minMinutes: number;
  weights: ScoreWeights;
};

export type UpcomingFixture = {
  event: number | null;
  opponent: string;
  difficulty: number;
  wasHome: boolean;
  kickoffTime: string | null;
};

export type PlayerFeature = {
  playerId: number;
  name: string;
  team: string;
  teamShortName: string;
  position: Position;
  cost: number;
  status: string;
  chanceOfPlaying: number | null;
  minutes: number;
  formPoints: number;
  xg: number;
  xa: number;
  defcon: number;
  teamAttack: number;
  teamDefence: number;
  fixtures: UpcomingFixture[];
};

export type ScoreBreakdown = {
  individual: number;
  team: number;
  fixtures: number;
  venue: number;
};

export type RankedPlayer = PlayerFeature & {
  rank: number;
  score: number;
  breakdown: ScoreBreakdown;
};

export type RankingResponse = {
  season: string | null;
  currentGameweek: number | null;
  syncedAt: string | null;
  rankings: RankedPlayer[];
  availableTeams: string[];
};
