import { query } from "@/lib/db";
import type {
  PlayerFeature,
  Position,
  RankingParams,
  RankingResponse,
  UpcomingFixture,
} from "@/lib/fpl-types";
import { scorePlayers } from "@/lib/scoring";

type PlayerRow = {
  player_id: number;
  player_code: number | null;
  name: string;
  team: string;
  team_short_name: string;
  position: Position;
  cost: number | null;
  status: string | null;
  chance_of_playing_next_round: number | null;
  minutes: number | null;
  form_points: number | null;
  xg: number | null;
  xa: number | null;
  defcon: number | null;
  last_season_points_per_90: number | null;
  last_season_xgi_per_90: number | null;
};

type TeamFormRow = {
  team_id: number;
  attack: number | null;
  defence: number | null;
};

type FixtureRow = {
  event: number | null;
  kickoff_time: Date | string | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
};

export async function getRankingData(params: RankingParams): Promise<RankingResponse> {
  const sync = await query<{ season: string; synced_at: Date | string }>(
    `SELECT season, max(completed_at) AS synced_at
     FROM sync_runs WHERE status = 'complete' AND source = 'official-fpl-api'
     GROUP BY season ORDER BY synced_at DESC NULLS LAST LIMIT 1`,
  );
  const current = sync[0];
  if (!current) {
    return { season: null, currentGameweek: null, syncedAt: null, rankings: [], availableTeams: [] };
  }

  const season = current.season;
  const priorSeason = `${Number(season.slice(0, 4)) - 1}-${season.slice(2, 4)}`;
  const gameweekRows = await query<{ current_gameweek: number | null }>(
    `SELECT max(event) AS current_gameweek FROM fixtures WHERE season = ? AND finished = true`,
    [season],
  );
  const currentGameweek = gameweekRows[0]?.current_gameweek ?? 0;
  const startGameweek = Math.max(1, currentGameweek - params.formWindow + 1);

  const [players, teamForm, upcoming, teams] = await Promise.all([
    query<PlayerRow>(
      `SELECT p.player_id, p.player_code, p.web_name AS name, t.name AS team, t.short_name AS team_short_name,
              p.position, p.now_cost AS cost, p.status, p.chance_of_playing_next_round,
              coalesce(sum(s.minutes), 0) AS minutes,
              coalesce(sum(s.total_points), 0) AS form_points,
              coalesce(sum(s.expected_goals), 0) AS xg,
              coalesce(sum(s.expected_assists), 0) AS xa,
              coalesce(sum(s.defensive_contribution), 0) AS defcon,
              coalesce(max(summary.total_points / nullif(summary.minutes, 0) * 90), 0) AS last_season_points_per_90,
              coalesce(max((summary.expected_goals + summary.expected_assists) / nullif(summary.minutes, 0) * 90), 0) AS last_season_xgi_per_90
       FROM players p
       JOIN teams t ON t.season = p.season AND t.team_id = p.team_id
       LEFT JOIN player_season_summaries summary
         ON summary.season = ? AND summary.player_code = p.player_code
       LEFT JOIN player_fixture_stats s
         ON s.season = p.season AND s.player_id = p.player_id
         AND s.event BETWEEN ? AND ?
       WHERE p.season = ?
       GROUP BY ALL`,
      [priorSeason, startGameweek, currentGameweek, season],
    ),
    query<TeamFormRow>(
      `WITH match_form AS (
         SELECT team_h AS team_id,
                CASE WHEN team_h_score > team_a_score THEN 3 WHEN team_h_score = team_a_score THEN 1 ELSE 0 END AS points,
                team_h_score AS scored, team_a_score AS conceded
         FROM fixtures WHERE season = ? AND finished = true AND event BETWEEN ? AND ?
         UNION ALL
         SELECT team_a AS team_id,
                CASE WHEN team_a_score > team_h_score THEN 3 WHEN team_a_score = team_h_score THEN 1 ELSE 0 END AS points,
                team_a_score AS scored, team_h_score AS conceded
         FROM fixtures WHERE season = ? AND finished = true AND event BETWEEN ? AND ?
       ),
       player_form AS (
         SELECT p.team_id,
                coalesce(sum(s.expected_goals + s.expected_assists), 0) AS xgi,
                coalesce(sum(s.defensive_contribution), 0) AS defcon
         FROM players p
         LEFT JOIN player_fixture_stats s ON s.season = p.season AND s.player_id = p.player_id
           AND s.event BETWEEN ? AND ?
         WHERE p.season = ? GROUP BY p.team_id
       )
       SELECT m.team_id,
              avg(m.points) + avg(m.scored) * 0.35 + coalesce(max(p.xgi), 0) * 0.1 AS attack,
              (3 - avg(m.conceded)) + coalesce(max(p.defcon), 0) * 0.03 AS defence
       FROM match_form m LEFT JOIN player_form p ON p.team_id = m.team_id
       GROUP BY m.team_id`,
      [season, startGameweek, currentGameweek, season, startGameweek, currentGameweek, startGameweek, currentGameweek, season],
    ),
    query<FixtureRow>(
      `SELECT event, kickoff_time, team_h, team_a, team_h_difficulty, team_a_difficulty
       FROM fixtures WHERE season = ? AND event > ? AND event <= ?
       ORDER BY event, kickoff_time`,
      [season, currentGameweek, currentGameweek + params.fixtureHorizon],
    ),
    query<{ team_id: number; name: string }>(
      `SELECT team_id, name FROM teams WHERE season = ? ORDER BY name`,
      [season],
    ),
  ]);

  const teamNames = new Map(teams.map((team) => [team.team_id, team.name]));
  const teamScores = new Map(teamForm.map((team) => [team.team_id, team]));
  const fixtureMap = new Map<number, UpcomingFixture[]>();
  for (const fixture of upcoming) {
    const kickoffTime =
      fixture.kickoff_time instanceof Date
        ? fixture.kickoff_time.toISOString()
        : fixture.kickoff_time ?? null;
    const home = fixtureMap.get(fixture.team_h) ?? [];
    home.push({
      event: fixture.event,
      opponent: teamNames.get(fixture.team_a) ?? "TBC",
      difficulty: fixture.team_h_difficulty,
      wasHome: true,
      kickoffTime,
    });
    fixtureMap.set(fixture.team_h, home);
    const away = fixtureMap.get(fixture.team_a) ?? [];
    away.push({
      event: fixture.event,
      opponent: teamNames.get(fixture.team_h) ?? "TBC",
      difficulty: fixture.team_a_difficulty,
      wasHome: false,
      kickoffTime,
    });
    fixtureMap.set(fixture.team_a, away);
  }

  const playerFeatures: PlayerFeature[] = players.map((player) => {
    const team = teams.find((entry) => entry.name === player.team);
    const teamScore = team ? teamScores.get(team.team_id) : undefined;
    return {
      playerId: player.player_id,
      name: player.name,
      team: player.team,
      teamShortName: player.team_short_name,
      position: player.position,
      cost: (player.cost ?? 0) / 10,
      status: player.status ?? "a",
      chanceOfPlaying: player.chance_of_playing_next_round,
      minutes: Number(player.minutes ?? 0),
      formPoints: Number(player.form_points ?? 0),
      xg: Number(player.xg ?? 0),
      xa: Number(player.xa ?? 0),
      defcon: Number(player.defcon ?? 0),
      lastSeasonPointsPer90: Number(player.last_season_points_per_90 ?? 0),
      lastSeasonXgiPer90: Number(player.last_season_xgi_per_90 ?? 0),
      teamAttack: Number(teamScore?.attack ?? 0),
      teamDefence: Number(teamScore?.defence ?? 0),
      fixtures: fixtureMap.get(team?.team_id ?? -1) ?? [],
    };
  });

  return {
    season,
    currentGameweek,
    syncedAt:
      current.synced_at instanceof Date ? current.synced_at.toISOString() : String(current.synced_at),
    rankings: scorePlayers(playerFeatures, params),
    availableTeams: teams.map((team) => team.name),
  };
}
