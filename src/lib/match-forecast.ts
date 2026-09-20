import { query } from "@/lib/db";
import {
  buildFixtureForecast,
  DEFAULT_FORECAST_PARAMS,
  deriveAttackDefenceRatings,
  type FinishedFixtureRow,
  type FixtureForecast,
  type ForecastParams,
  type TeamRatingRow,
  type TeamStrength,
} from "@/lib/match-forecast-model";

export {
  DEFAULT_FORECAST_PARAMS,
  deriveAttackDefenceRatings,
  expectedGoalsForFixture,
  expectedValue,
  modelProbabilityForMarket,
  runBivariatePoissonMonteCarlo,
} from "@/lib/match-forecast-model";
export type {
  FixtureForecast,
  ForecastParams,
  TeamStrength,
} from "@/lib/match-forecast-model";

type UpcomingFixtureRow = FinishedFixtureRow & {
  finished: boolean;
};

type SeasonMeta = {
  season: string;
  currentGameweek: number;
};

export type ForecastData = {
  season: string | null;
  currentGameweek: number | null;
  leagueAverageGoals: number | null;
  homeAdvantage: number;
  teamStrengths: TeamStrength[];
  upcomingFixtures: FixtureForecast[];
  availableGameweeks: number[];
  defaultGameweek: number | null;
};

export type GetForecastOptions = {
  gameweek?: number;
  skipCache?: boolean;
};

const FORECAST_CACHE_TTL_MS = 5 * 60 * 1000;
const EMPTY_FORECAST: ForecastData = {
  season: null,
  currentGameweek: null,
  leagueAverageGoals: null,
  homeAdvantage: DEFAULT_FORECAST_PARAMS.homeAdvantage,
  teamStrengths: [],
  upcomingFixtures: [],
  availableGameweeks: [],
  defaultGameweek: null,
};

let forecastCache: { key: string; data: ForecastData; expiresAt: number } | null = null;

function forecastCacheKey(params: ForecastParams) {
  return JSON.stringify(params);
}

function filterForecastByGameweek(data: ForecastData, gameweek: number): ForecastData {
  return {
    ...data,
    upcomingFixtures: data.upcomingFixtures.filter((fixture) => fixture.event === gameweek),
  };
}

export function invalidateForecastCache() {
  forecastCache = null;
}

export function resolveDefaultGameweek(
  availableGameweeks: number[],
  completedGameweek: number,
) {
  if (!availableGameweeks.length) return null;
  return availableGameweeks.find((gameweek) => gameweek > completedGameweek)
    ?? availableGameweeks[0]!;
}

async function getSeasonMeta(): Promise<SeasonMeta | null> {
  const sync = await query<{ season: string }>(
    `SELECT season
     FROM sync_runs
     WHERE status = 'complete' AND source = 'official-fpl-api'
     GROUP BY season
     ORDER BY max(completed_at) DESC NULLS LAST
     LIMIT 1`,
  );
  const season = sync[0]?.season;
  if (!season) return null;

  const gameweekRows = await query<{ current_gameweek: number | null }>(
    `SELECT max(event) AS current_gameweek FROM fixtures WHERE season = ? AND finished = true`,
    [season],
  );

  return {
    season,
    currentGameweek: gameweekRows[0]?.current_gameweek ?? 0,
  };
}

function buildFixtureForecasts(
  fixtures: UpcomingFixtureRow[],
  strengthById: Map<number, TeamStrength>,
  teamNameById: Map<number, TeamRatingRow>,
  leagueAverageGoals: number,
  homeAdvantage: number,
  params: ForecastParams,
): FixtureForecast[] {
  return fixtures.map((fixture) => {
    const homeTeam = strengthById.get(fixture.team_h);
    const awayTeam = strengthById.get(fixture.team_a);
    const homeMeta = teamNameById.get(fixture.team_h);
    const awayMeta = teamNameById.get(fixture.team_a);

    if (!homeTeam || !awayTeam || !homeMeta || !awayMeta) {
      return {
        fixtureId: fixture.fixture_id,
        event: fixture.event,
        kickoffTime: fixture.kickoff_time ? String(fixture.kickoff_time) : null,
        homeTeamId: fixture.team_h,
        awayTeamId: fixture.team_a,
        homeTeam: homeMeta?.name ?? "Home",
        awayTeam: awayMeta?.name ?? "Away",
        homeShortName: homeMeta?.short_name ?? "H",
        awayShortName: awayMeta?.short_name ?? "A",
        expectedHomeGoals: 0,
        expectedAwayGoals: 0,
        homeWinProb: 0,
        drawProb: 0,
        awayWinProb: 0,
        over25Prob: 0,
        bttsProb: 0,
        topScorelines: [],
        lambdaHome: 0,
        lambdaAway: 0,
        lambdaShared: 0,
      };
    }

    return buildFixtureForecast(
      fixture,
      homeTeam,
      awayTeam,
      homeMeta,
      awayMeta,
      leagueAverageGoals,
      homeAdvantage,
      params,
    );
  });
}

async function buildForecastData(
  params: ForecastParams,
  gameweek?: number,
): Promise<ForecastData> {
  const meta = await getSeasonMeta();
  if (!meta) {
    return { ...EMPTY_FORECAST, homeAdvantage: params.homeAdvantage };
  }

  const minGameweek = Math.max(1, meta.currentGameweek - params.lookbackGameweeks + 1);
  const [teams, finishedFixtures, upcomingFixtures, upcomingEvents] = await Promise.all([
    query<TeamRatingRow>(
      `SELECT team_id, name, short_name, strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away
       FROM teams WHERE season = ? ORDER BY name`,
      [meta.season],
    ),
    query<FinishedFixtureRow>(
      `SELECT fixture_id, event, kickoff_time, team_h, team_a, team_h_score, team_a_score
       FROM fixtures
       WHERE season = ? AND finished = true AND event BETWEEN ? AND ?
         AND team_h_score IS NOT NULL AND team_a_score IS NOT NULL
       ORDER BY event, kickoff_time`,
      [meta.season, minGameweek, meta.currentGameweek],
    ),
    query<UpcomingFixtureRow>(
      `SELECT fixture_id, event, kickoff_time, team_h, team_a, team_h_score, team_a_score, finished
       FROM fixtures
       WHERE season = ? AND finished = false
       ORDER BY kickoff_time NULLS LAST, event, fixture_id`,
      [meta.season],
    ),
    query<{ event: number }>(
      `SELECT DISTINCT event
       FROM fixtures
       WHERE season = ? AND finished = false AND event IS NOT NULL
       ORDER BY event`,
      [meta.season],
    ),
  ]);

  const { leagueAverageGoals, homeAdvantage, strengths } = deriveAttackDefenceRatings(
    finishedFixtures,
    teams,
    params,
  );
  const strengthById = new Map(strengths.map((team) => [team.teamId, team]));
  const teamNameById = new Map(teams.map((team) => [team.team_id, team]));

  const simulationTargets = gameweek
    ? upcomingFixtures.filter((fixture) => fixture.event === gameweek)
    : upcomingFixtures;

  const forecasts = buildFixtureForecasts(
    simulationTargets,
    strengthById,
    teamNameById,
    leagueAverageGoals,
    homeAdvantage,
    params,
  );

  const availableGameweeks = upcomingEvents
    .map((row) => row.event)
    .filter((event): event is number => Number.isInteger(event));
  const defaultGameweek = resolveDefaultGameweek(availableGameweeks, meta.currentGameweek);

  return {
    season: meta.season,
    currentGameweek: meta.currentGameweek,
    leagueAverageGoals,
    homeAdvantage,
    teamStrengths: strengths,
    upcomingFixtures: forecasts,
    availableGameweeks,
    defaultGameweek,
  };
}

export async function getForecastData(
  params: ForecastParams = DEFAULT_FORECAST_PARAMS,
  options?: GetForecastOptions,
): Promise<ForecastData> {
  const cacheKey = forecastCacheKey(params);
  const now = Date.now();

  if (!options?.skipCache && forecastCache?.key === cacheKey && forecastCache.expiresAt > now) {
    return options?.gameweek
      ? filterForecastByGameweek(forecastCache.data, options.gameweek)
      : forecastCache.data;
  }

  if (options?.gameweek) {
    return buildForecastData(params, options.gameweek);
  }

  const data = await buildForecastData(params);
  if (!options?.skipCache) {
    forecastCache = { key: cacheKey, data, expiresAt: now + FORECAST_CACHE_TTL_MS };
  }
  return data;
}

export async function getFixtureForecast(
  fixtureId: number,
  params: ForecastParams = DEFAULT_FORECAST_PARAMS,
) {
  const data = await getForecastData(params);
  const forecast = data.upcomingFixtures.find((fixture) => fixture.fixtureId === fixtureId) ?? null;
  return { ...data, forecast };
}
