import type { ForecastParams } from "@/lib/match-forecast-model";

export type FixtureSimulationSetup = {
  season: string;
  currentGameweek: number;
  fixtureId: number;
  event: number | null;
  kickoffTime: string | null;
  finished: boolean;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: string;
  awayTeam: string;
  homeShortName: string;
  awayShortName: string;
  lambdaHome: number;
  lambdaAway: number;
  lambdaShared: number;
  leagueAverageGoals: number;
  correlation: number;
  homeAdvantage: number;
  lookbackGameweeks: number;
  fplStrengthBlend: number;
  simulations: number;
};

export const MIN_MATCH_SIMULATIONS = 100;
export const MAX_MATCH_SIMULATIONS = 100_000;

export function clampSimulationCount(value: number, fallback = 5_000) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_MATCH_SIMULATIONS, Math.max(MIN_MATCH_SIMULATIONS, Math.round(value)));
}

export function monteCarloBatchSize(total: number, completed: number) {
  const remaining = Math.max(0, Math.floor(total) - Math.max(0, Math.floor(completed)));
  if (remaining === 0) return 0;
  const durationMs = Math.min(6400, Math.max(1400, total / 6));
  const frames = Math.max(24, Math.round(durationMs / 32));
  const batch = Math.max(1, Math.ceil(total / frames));
  return Math.min(batch, remaining);
}

export function forecastMatchHref(fixtureId: number, params: ForecastParams) {
  const query = new URLSearchParams({
    lookback: String(params.lookbackGameweeks),
    homeAdvantage: String(params.homeAdvantage),
    correlation: String(params.correlation),
    simulations: String(params.simulations),
    fplBlend: String(params.fplStrengthBlend),
  });
  return `/forecast/${fixtureId}?${query.toString()}`;
}
