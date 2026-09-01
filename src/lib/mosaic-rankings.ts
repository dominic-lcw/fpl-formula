import type { Position, RankingParams } from "@/lib/fpl-types";

const parquetTables = [
  "teams",
  "players",
  "player_season_summaries",
  "fixtures",
  "player_fixture_stats",
  "sync_runs",
] as const;

type Vgplot = typeof import("@uwdata/vgplot");

export type MosaicRankingData = {
  season: string | null;
  currentGameweek: number | null;
  includesLiveGameweek: boolean;
  syncedAt: string | null;
  availableTeams: string[];
  count: number;
};

type MetadataRow = {
  season: string;
  current_gameweek: number | null;
  synced_at: Date | string | null;
};

type CountRow = {
  count: number;
};

export type RankedPlayerSuggestion = {
  rank: number;
  player: string;
  club: string;
  position: Position;
  score: number;
};

let vgplotPromise: Promise<Vgplot> | undefined;
let datasetPromise: Promise<Vgplot> | undefined;
let databaseUpdate: Promise<void> = Promise.resolve();

export function getMosaic() {
  if (!vgplotPromise) {
    vgplotPromise = import("@uwdata/vgplot").then((vg) => {
      vg.coordinator().databaseConnector(vg.wasmConnector());
      return vg;
    });
  }
  return vgplotPromise;
}

async function loadDataset() {
  if (!datasetPromise) {
    datasetPromise = getMosaic().then(async (vg) => {
      await vg.coordinator().exec(
        parquetTables.map((table) =>
          vg.loadParquet(
            table,
            `${typeof window !== "undefined" ? window.location.origin : ""}/api/parquet/${table}`,
            { replace: true },
          ),
        ),
      );
      return vg;
    });
    datasetPromise.catch(() => {
      datasetPromise = undefined;
    });
  }
  return datasetPromise;
}

export async function loadMosaicDataset() {
  return loadDataset();
}

let reloadPromise: Promise<Vgplot> | undefined;

async function reloadDataset() {
  if (!reloadPromise) {
    reloadPromise = databaseUpdate.then(async () => {
      datasetPromise = undefined;
      return loadDataset();
    });
    reloadPromise.finally(() => {
      reloadPromise = undefined;
    }).catch(() => undefined);
  }
  return reloadPromise;
}

function escapedSqlString(value: string) {
  return value.replaceAll("'", "''");
}

function escapedLikePattern(value: string) {
  return escapedSqlString(value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_"));
}

function gameweekSql(liveGameweek?: number | null) {
  if (Number.isInteger(liveGameweek) && liveGameweek && liveGameweek > 0) {
    return String(liveGameweek);
  }

  return `coalesce((
    SELECT max(event)
    FROM fixtures
    WHERE fixtures.season = current_sync.season AND finished = true
  ), 0)`;
}

function rankingQuery(
  params: RankingParams,
  position: Position | "ALL",
  team: string,
  liveGameweek?: number | null,
) {
  const startGameweek = `greatest(1, current_gameweek - ${params.formWindow - 1})`;
  const currentGameweek = gameweekSql(liveGameweek);
  const finalFilters = [
    position !== "ALL" ? `position = '${position}'` : null,
    team !== "ALL" ? `team_name = '${escapedSqlString(team)}'` : null,
  ].filter(Boolean);
  const where = finalFilters.length ? `WHERE ${finalFilters.join(" AND ")}` : "";
  const totalWeight =
    params.weights.individual + params.weights.team + params.weights.fixtures || 1;

  return `
    CREATE OR REPLACE TEMP TABLE ranked_players AS
    WITH current_sync AS (
      SELECT season, max(completed_at) AS synced_at
      FROM sync_runs
      WHERE status = 'complete' AND source = 'official-fpl-api'
      GROUP BY season
      ORDER BY synced_at DESC NULLS LAST
      LIMIT 1
    ),
    context AS (
      SELECT
        season,
        concat(cast(cast(substr(season, 1, 4) AS INTEGER) - 1 AS VARCHAR), '-', substr(season, 3, 2)) AS prior_season,
        ${currentGameweek} AS current_gameweek
      FROM current_sync
    ),
    player_features AS (
      SELECT
        p.player_id,
        p.web_name AS player,
        t.name AS team_name,
        t.short_name AS club,
        p.position,
        p.now_cost / 10 AS price,
        p.team_id,
        coalesce(sum(s.minutes), 0) AS minutes,
        coalesce(sum(s.total_points), 0) AS form_points,
        coalesce(sum(s.expected_goals), 0) AS xg,
        coalesce(sum(s.expected_assists), 0) AS xa,
        coalesce(sum(s.defensive_contribution), 0) AS defcon,
        coalesce(max(CASE WHEN summary.minutes >= 450 THEN summary.total_points / summary.minutes * 90 END), 0) AS last_year_per_90,
        coalesce(max(CASE WHEN summary.minutes >= 450 THEN (summary.expected_goals + summary.expected_assists) / summary.minutes * 90 END), 0) AS last_year_xgi_per_90
      FROM players p
      JOIN teams t ON t.season = p.season AND t.team_id = p.team_id
      CROSS JOIN context c
      LEFT JOIN player_season_summaries summary
        ON summary.season = c.prior_season AND summary.player_code = p.player_code
      LEFT JOIN player_fixture_stats s
        ON s.season = p.season AND s.player_id = p.player_id
        AND s.event BETWEEN ${startGameweek} AND c.current_gameweek
      WHERE p.season = c.season
      GROUP BY ALL
    ),
    match_form AS (
      SELECT
        team_h AS team_id,
        CASE WHEN team_h_score > team_a_score THEN 3 WHEN team_h_score = team_a_score THEN 1 ELSE 0 END AS points,
        team_h_score AS scored,
        team_a_score AS conceded
      FROM fixtures
      CROSS JOIN context c
      WHERE fixtures.season = c.season AND finished = true AND event BETWEEN ${startGameweek} AND c.current_gameweek
      UNION ALL
      SELECT
        team_a AS team_id,
        CASE WHEN team_a_score > team_h_score THEN 3 WHEN team_a_score = team_h_score THEN 1 ELSE 0 END AS points,
        team_a_score AS scored,
        team_h_score AS conceded
      FROM fixtures
      CROSS JOIN context c
      WHERE fixtures.season = c.season AND finished = true AND event BETWEEN ${startGameweek} AND c.current_gameweek
    ),
    player_form AS (
      SELECT
        p.team_id,
        coalesce(sum(s.expected_goals + s.expected_assists), 0) AS xgi,
        coalesce(sum(s.defensive_contribution), 0) AS defcon
      FROM players p
      CROSS JOIN context c
      LEFT JOIN player_fixture_stats s
        ON s.season = p.season AND s.player_id = p.player_id
        AND s.event BETWEEN ${startGameweek} AND c.current_gameweek
      WHERE p.season = c.season
      GROUP BY p.team_id
    ),
    team_form AS (
      SELECT
        m.team_id,
        avg(m.points) + avg(m.scored) * 0.35 + coalesce(max(p.xgi), 0) * 0.1 AS attack,
        (3 - avg(m.conceded)) + coalesce(max(p.defcon), 0) * 0.03 AS defence
      FROM match_form m
      LEFT JOIN player_form p ON p.team_id = m.team_id
      GROUP BY m.team_id
    ),
    upcoming AS (
      SELECT
        f.team_h AS team_id,
        f.event,
        f.kickoff_time,
        f.team_h_difficulty AS difficulty,
        f.team_a AS opponent_id,
        true AS was_home
      FROM fixtures f
      CROSS JOIN context c
      WHERE f.season = c.season
        AND f.event > c.current_gameweek
        AND f.event <= c.current_gameweek + ${params.fixtureHorizon}
      UNION ALL
      SELECT
        f.team_a AS team_id,
        f.event,
        f.kickoff_time,
        f.team_a_difficulty AS difficulty,
        f.team_h AS opponent_id,
        false AS was_home
      FROM fixtures f
      CROSS JOIN context c
      WHERE f.season = c.season
        AND f.event > c.current_gameweek
        AND f.event <= c.current_gameweek + ${params.fixtureHorizon}
    ),
    fixture_metrics AS (
      SELECT
        u.team_id,
        avg((6 - u.difficulty + CASE WHEN u.was_home THEN 0.5 ELSE -0.5 END) * 20) AS fixture_raw,
        string_agg(concat(upper(left(t.short_name, 3)), ' ', CASE WHEN u.was_home THEN 'H' ELSE 'A' END), ' · ' ORDER BY u.event, u.kickoff_time) AS next_fixtures
      FROM upcoming u
      JOIN teams t ON t.team_id = u.opponent_id
      CROSS JOIN context c
      WHERE t.season = c.season
      GROUP BY u.team_id
    ),
    raw_scores AS (
      SELECT
        p.*,
        (p.xg + p.xa) * 0.55
          + p.form_points * 0.3
          + p.defcon * CASE WHEN p.position = 'DEF' THEN 1 WHEN p.position = 'MID' THEN 0.55 ELSE 0.15 END * 0.15
          + (p.last_year_xgi_per_90 * 4 + p.last_year_per_90) * 0.25 AS individual_raw,
        coalesce(tf.attack, 0) * CASE WHEN p.position IN ('GKP', 'DEF') THEN 0.4 ELSE 0.8 END
          + coalesce(tf.defence, 0) * CASE WHEN p.position IN ('GKP', 'DEF') THEN 0.6 ELSE 0.2 END AS team_raw,
        coalesce(fm.fixture_raw, 0) AS fixture_raw,
        coalesce(fm.next_fixtures, '—') AS next_fixtures
      FROM player_features p
      LEFT JOIN team_form tf ON tf.team_id = p.team_id
      LEFT JOIN fixture_metrics fm ON fm.team_id = p.team_id
    ),
    scaled_scores AS (
      SELECT
        *,
        CASE WHEN max(individual_raw) OVER () = min(individual_raw) OVER () THEN 50 ELSE (individual_raw - min(individual_raw) OVER ()) * 100 / (max(individual_raw) OVER () - min(individual_raw) OVER ()) END AS individual_score,
        CASE WHEN max(team_raw) OVER () = min(team_raw) OVER () THEN 50 ELSE (team_raw - min(team_raw) OVER ()) * 100 / (max(team_raw) OVER () - min(team_raw) OVER ()) END AS team_score,
        CASE WHEN max(fixture_raw) OVER () = min(fixture_raw) OVER () THEN 50 ELSE (fixture_raw - min(fixture_raw) OVER ()) * 100 / (max(fixture_raw) OVER () - min(fixture_raw) OVER ()) END AS fixture_score
      FROM raw_scores
    ),
    weighted_scores AS (
      SELECT
        *,
        round((
          individual_score * ${params.weights.individual}
          + team_score * ${params.weights.team}
          + fixture_score * ${params.weights.fixtures}
        ) / ${totalWeight}, 1) AS score
      FROM scaled_scores
    ),
    ranked AS (
      SELECT
        *,
        row_number() OVER (ORDER BY score DESC, xg + xa DESC) AS rank
      FROM weighted_scores
      WHERE minutes >= ${params.minMinutes}
    )
    SELECT
      rank,
      score,
      player,
      club,
      position,
      price,
      form_points,
      minutes,
      xg,
      xa,
      last_year_per_90,
      defcon,
      next_fixtures
    FROM ranked
    ${where}
  `;
}

export async function calculateMosaicRankings(
  params: RankingParams,
  position: Position | "ALL",
  team: string,
  options: {
    refreshDataset?: boolean;
    liveGameweek?: number | null;
  } = {},
): Promise<MosaicRankingData> {
  const { refreshDataset = false, liveGameweek } = options;
  const includesLiveGameweek = Number.isInteger(liveGameweek) && Boolean(liveGameweek && liveGameweek > 0);
  const vg = await (refreshDataset ? reloadDataset() : loadDataset());
  const coordinator = vg.coordinator();
  const query = rankingQuery(params, position, team, includesLiveGameweek ? liveGameweek : null);

  const update = databaseUpdate.then(async () => {
    coordinator.clear({ clients: false });
    await coordinator.exec(query);
  });
  databaseUpdate = update.catch(() => undefined);
  await update;

  const [metadataResult, teamsResult, countResult] = await Promise.all([
    coordinator.query(
      `WITH current_sync AS (
         SELECT season, max(completed_at) AS synced_at
         FROM sync_runs
         WHERE status = 'complete' AND source = 'official-fpl-api'
         GROUP BY season
         ORDER BY synced_at DESC NULLS LAST
         LIMIT 1
       ),
       context AS (
         SELECT season, ${gameweekSql(includesLiveGameweek ? liveGameweek : null)} AS current_gameweek, synced_at
         FROM current_sync
       )
       SELECT
         season,
         current_gameweek,
         synced_at
       FROM context`,
      { type: "json", cache: false },
    ),
    coordinator.query(
      `SELECT t.name
       FROM teams t
       WHERE t.season = (
         SELECT season FROM sync_runs
         WHERE status = 'complete' AND source = 'official-fpl-api'
         ORDER BY completed_at DESC NULLS LAST
         LIMIT 1
       )
       ORDER BY t.name`,
      { type: "json", cache: false },
    ),
    coordinator.query("SELECT count(*) AS count FROM ranked_players", {
      type: "json",
      cache: false,
    }),
  ]);

  const metadata = metadataResult as MetadataRow[];
  const teams = teamsResult as { name: string }[];
  const count = countResult as CountRow[];
  const current = metadata[0];
  return {
    season: current?.season ?? null,
    currentGameweek: Number(current?.current_gameweek ?? 0) || 0,
    includesLiveGameweek,
    syncedAt: current?.synced_at ? new Date(current.synced_at).toISOString() : null,
    availableTeams: teams.map((entry) => entry.name),
    count: Number(count[0]?.count ?? 0),
  };
}

export async function searchRankedPlayers(searchTerm: string): Promise<RankedPlayerSuggestion[]> {
  const term = searchTerm.trim();
  if (!term) return [];

  await databaseUpdate;
  const escapedTerm = escapedLikePattern(term);
  const results = await (await getMosaic()).coordinator().query(
    `SELECT rank, player, club, position, score
     FROM ranked_players
     WHERE player ILIKE '%${escapedTerm}%' ESCAPE '\\'
     ORDER BY
       CASE
         WHEN player ILIKE '${escapedTerm}' ESCAPE '\\' THEN 0
         WHEN player ILIKE '${escapedTerm}%' ESCAPE '\\' THEN 1
         ELSE 2
       END,
       rank
     LIMIT 8`,
    { type: "json", cache: false },
  ) as RankedPlayerSuggestion[];

  return results.map((result) => ({
    ...result,
    rank: Number(result.rank),
    score: Number(result.score),
  }));
}
