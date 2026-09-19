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

export async function getForecastData(params: ForecastParams = DEFAULT_FORECAST_PARAMS) {
  const meta = await getSeasonMeta();
  if (!meta) {
    return {
      season: null,
      currentGameweek: null,
      leagueAverageGoals: null,
      homeAdvantage: params.homeAdvantage,
      teamStrengths: [] as TeamStrength[],
      upcomingFixtures: [] as FixtureForecast[],
      availableGameweeks: [] as number[],
      defaultGameweek: null as number | null,
    };
  }

  const minGameweek = Math.max(1, meta.currentGameweek - params.lookbackGameweeks + 1);
  const [teams, finishedFixtures, upcomingFixtures] = await Promise.all([
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
  ]);

  const { leagueAverageGoals, homeAdvantage, strengths } = deriveAttackDefenceRatings(
    finishedFixtures,
    teams,
    params,
  );
  const strengthById = new Map(strengths.map((team) => [team.teamId, team]));
  const teamNameById = new Map(teams.map((team) => [team.team_id, team]));

  const forecasts: FixtureForecast[] = upcomingFixtures.map((fixture) => {
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

  const availableGameweeks = [...new Set(
    forecasts.map((fixture) => fixture.event).filter((event): event is number => Number.isInteger(event)),
  )].sort((left, right) => left - right);
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

export async function getFixtureForecast(
  fixtureId: number,
  params: ForecastParams = DEFAULT_FORECAST_PARAMS,
) {
  const data = await getForecastData(params);
  const forecast = data.upcomingFixtures.find((fixture) => fixture.fixtureId === fixtureId) ?? null;
  return { ...data, forecast };
}
