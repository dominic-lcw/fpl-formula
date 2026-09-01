import { loadMosaicDataset } from "@/lib/mosaic-rankings";
import { sanitiseParams } from "@/lib/scoring";
import type { RankingParams } from "@/lib/fpl-types";

export type FormulaStrategy = {
  id: string;
  name: string;
  description: string;
  params: RankingParams;
  source: "starter" | "saved";
};

export type BacktestRound = {
  gameweek: number;
  pickedPlayers: number;
  points: number;
};

export type StrategyBacktest = {
  strategyId: string;
  totalPoints: number;
  averagePoints: number;
  completeSelections: number;
  rounds: BacktestRound[];
};

type BacktestRow = {
  target_gw: number;
  picked_players: number;
  round_points: number;
};

const starterStrategies = [
  ["balanced", "Balanced", "A practical blend of recent form, team momentum, and the next three fixtures.", 5, 3, 45, 20, 35],
  ["form-surge", "Form surge", "Rewards the sharpest recent player and team form over a short horizon.", 3, 2, 65, 25, 10],
  ["fixture-hunter", "Fixture hunter", "Leans hard into the upcoming schedule while retaining a form check.", 4, 5, 25, 15, 60],
  ["steady-signal", "Steady signal", "Uses a longer form window to soften one-gameweek volatility.", 8, 4, 50, 30, 20],
  ["player-first", "Player first", "Prioritises individual underlying numbers and FPL returns.", 6, 3, 75, 15, 10],
  ["team-momentum", "Team momentum", "Gives more weight to attacking and defensive team performance.", 5, 3, 35, 50, 15],
  ["next-up", "Next up", "Optimises for the immediate two-gameweek fixture opportunity.", 4, 2, 35, 15, 50],
  ["all-rounder", "All-rounder", "A diversified signal designed to avoid any single component dominating.", 6, 4, 40, 30, 30],
] as const;

export const STARTER_STRATEGIES: FormulaStrategy[] = starterStrategies.map(
  ([id, name, description, formWindow, fixtureHorizon, individual, team, fixtures]) => ({
    id,
    name,
    description,
    params: {
      formWindow,
      fixtureHorizon,
      minMinutes: 0,
      weights: { individual, team, fixtures },
    },
    source: "starter",
  }),
);

function escapedSqlString(value: string) {
  return value.replaceAll("'", "''");
}

function backtestQuery(strategy: FormulaStrategy) {
  const params = sanitiseParams(strategy.params);
  const totalWeight =
    params.weights.individual + params.weights.team + params.weights.fixtures || 1;
  const strategyId = escapedSqlString(strategy.id);

  return `
    WITH current_sync AS (
      SELECT season
      FROM sync_runs
      WHERE status = 'complete' AND source = 'official-fpl-api'
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 1
    ),
    context AS (
      SELECT
        sync.season,
        concat(cast(cast(substr(sync.season, 1, 4) AS INTEGER) - 1 AS VARCHAR), '-', substr(sync.season, 3, 2)) AS prior_season,
        coalesce(max(f.event), 0) AS completed_gameweek
      FROM current_sync sync
      LEFT JOIN fixtures f ON f.season = sync.season AND f.finished = true
      GROUP BY ALL
    ),
    rounds AS (
      SELECT target_gw
      FROM context, range(1, completed_gameweek + 1) AS gameweeks(target_gw)
    ),
    player_features AS (
      SELECT
        r.target_gw,
        p.player_id,
        p.position,
        coalesce(sum(history.minutes), 0) AS minutes,
        coalesce(sum(history.total_points), 0) AS form_points,
        coalesce(sum(history.expected_goals), 0) AS xg,
        coalesce(sum(history.expected_assists), 0) AS xa,
        coalesce(sum(history.defensive_contribution), 0) AS defcon,
        coalesce(max(CASE WHEN summary.minutes >= 450 THEN summary.total_points / summary.minutes * 90 END), 0) AS last_year_per_90,
        coalesce(max(CASE WHEN summary.minutes >= 450 THEN (summary.expected_goals + summary.expected_assists) / summary.minutes * 90 END), 0) AS last_year_xgi_per_90,
        coalesce(
          arg_max(CASE WHEN history.was_home THEN played_fixture.team_h ELSE played_fixture.team_a END, history.event),
          p.team_id
        ) AS team_id
      FROM players p
      CROSS JOIN context c
      CROSS JOIN rounds r
      LEFT JOIN player_season_summaries summary
        ON summary.season = c.prior_season AND summary.player_code = p.player_code
      LEFT JOIN player_fixture_stats history
        ON history.season = c.season
        AND history.player_id = p.player_id
        AND history.event BETWEEN greatest(1, r.target_gw - ${params.formWindow}) AND r.target_gw - 1
      LEFT JOIN fixtures played_fixture
        ON played_fixture.season = history.season AND played_fixture.fixture_id = history.fixture_id
      WHERE p.season = c.season
      GROUP BY ALL
    ),
    match_form AS (
      SELECT r.target_gw, f.team_h AS team_id,
             CASE WHEN f.team_h_score > f.team_a_score THEN 3 WHEN f.team_h_score = f.team_a_score THEN 1 ELSE 0 END AS points,
             f.team_h_score AS scored, f.team_a_score AS conceded
      FROM context c CROSS JOIN rounds r
      JOIN fixtures f ON f.season = c.season
        AND f.finished = true
        AND f.event BETWEEN greatest(1, r.target_gw - ${params.formWindow}) AND r.target_gw - 1
      UNION ALL
      SELECT r.target_gw, f.team_a AS team_id,
             CASE WHEN f.team_a_score > f.team_h_score THEN 3 WHEN f.team_a_score = f.team_h_score THEN 1 ELSE 0 END AS points,
             f.team_a_score AS scored, f.team_h_score AS conceded
      FROM context c CROSS JOIN rounds r
      JOIN fixtures f ON f.season = c.season
        AND f.finished = true
        AND f.event BETWEEN greatest(1, r.target_gw - ${params.formWindow}) AND r.target_gw - 1
    ),
    player_team_form AS (
      SELECT
        r.target_gw,
        CASE WHEN history.was_home THEN fixture.team_h ELSE fixture.team_a END AS team_id,
        coalesce(sum(history.expected_goals + history.expected_assists), 0) AS xgi,
        coalesce(sum(history.defensive_contribution), 0) AS defcon
      FROM context c CROSS JOIN rounds r
      JOIN player_fixture_stats history
        ON history.season = c.season
        AND history.event BETWEEN greatest(1, r.target_gw - ${params.formWindow}) AND r.target_gw - 1
      JOIN fixtures fixture ON fixture.season = history.season AND fixture.fixture_id = history.fixture_id
      GROUP BY ALL
    ),
    team_form AS (
      SELECT
        m.target_gw,
        m.team_id,
        avg(m.points) + avg(m.scored) * 0.35 + coalesce(max(p.xgi), 0) * 0.1 AS attack,
        (3 - avg(m.conceded)) + coalesce(max(p.defcon), 0) * 0.03 AS defence
      FROM match_form m
      LEFT JOIN player_team_form p ON p.target_gw = m.target_gw AND p.team_id = m.team_id
      GROUP BY ALL
    ),
    upcoming AS (
      SELECT r.target_gw, f.team_h AS team_id, f.team_h_difficulty AS difficulty, true AS was_home
      FROM context c CROSS JOIN rounds r
      JOIN fixtures f ON f.season = c.season
        AND f.event >= r.target_gw
        AND f.event < r.target_gw + ${params.fixtureHorizon}
      UNION ALL
      SELECT r.target_gw, f.team_a AS team_id, f.team_a_difficulty AS difficulty, false AS was_home
      FROM context c CROSS JOIN rounds r
      JOIN fixtures f ON f.season = c.season
        AND f.event >= r.target_gw
        AND f.event < r.target_gw + ${params.fixtureHorizon}
    ),
    fixture_metrics AS (
      SELECT
        target_gw,
        team_id,
        avg((6 - difficulty + CASE WHEN was_home THEN 0.5 ELSE -0.5 END) * 20) AS fixture_raw
      FROM upcoming
      GROUP BY ALL
    ),
    round_outcomes AS (
      SELECT
        r.target_gw,
        outcome.player_id,
        coalesce(sum(outcome.total_points), 0) AS actual_points
      FROM context c CROSS JOIN rounds r
      JOIN player_fixture_stats outcome
        ON outcome.season = c.season AND outcome.event = r.target_gw
      GROUP BY ALL
    ),
    raw_scores AS (
      SELECT
        pf.*,
        coalesce(outcome.actual_points, 0) AS actual_points,
        (pf.xg + pf.xa) * 0.55
          + pf.form_points * 0.3
          + pf.defcon * CASE WHEN pf.position = 'DEF' THEN 1 WHEN pf.position = 'MID' THEN 0.55 ELSE 0.15 END * 0.15
          + (pf.last_year_xgi_per_90 * 4 + pf.last_year_per_90) * 0.25 AS individual_raw,
        coalesce(tf.attack, 0) * CASE WHEN pf.position IN ('GKP', 'DEF') THEN 0.4 ELSE 0.8 END
          + coalesce(tf.defence, 0) * CASE WHEN pf.position IN ('GKP', 'DEF') THEN 0.6 ELSE 0.2 END AS team_raw,
        coalesce(fm.fixture_raw, 0) AS fixture_raw
      FROM player_features pf
      LEFT JOIN team_form tf ON tf.target_gw = pf.target_gw AND tf.team_id = pf.team_id
      LEFT JOIN fixture_metrics fm ON fm.target_gw = pf.target_gw AND fm.team_id = pf.team_id
      LEFT JOIN round_outcomes outcome ON outcome.target_gw = pf.target_gw AND outcome.player_id = pf.player_id
    ),
    scaled_scores AS (
      SELECT
        *,
        CASE WHEN max(individual_raw) OVER (PARTITION BY target_gw) = min(individual_raw) OVER (PARTITION BY target_gw) THEN 50 ELSE (individual_raw - min(individual_raw) OVER (PARTITION BY target_gw)) * 100 / (max(individual_raw) OVER (PARTITION BY target_gw) - min(individual_raw) OVER (PARTITION BY target_gw)) END AS individual_score,
        CASE WHEN max(team_raw) OVER (PARTITION BY target_gw) = min(team_raw) OVER (PARTITION BY target_gw) THEN 50 ELSE (team_raw - min(team_raw) OVER (PARTITION BY target_gw)) * 100 / (max(team_raw) OVER (PARTITION BY target_gw) - min(team_raw) OVER (PARTITION BY target_gw)) END AS team_score,
        CASE WHEN max(fixture_raw) OVER (PARTITION BY target_gw) = min(fixture_raw) OVER (PARTITION BY target_gw) THEN 50 ELSE (fixture_raw - min(fixture_raw) OVER (PARTITION BY target_gw)) * 100 / (max(fixture_raw) OVER (PARTITION BY target_gw) - min(fixture_raw) OVER (PARTITION BY target_gw)) END AS fixture_score
      FROM raw_scores
    ),
    selected AS (
      SELECT
        *,
        row_number() OVER (
          PARTITION BY target_gw
          ORDER BY
            (individual_score * ${params.weights.individual} + team_score * ${params.weights.team} + fixture_score * ${params.weights.fixtures}) / ${totalWeight} DESC,
            xg + xa DESC
        ) AS pick_rank
      FROM scaled_scores
      WHERE minutes >= ${params.minMinutes}
    )
    SELECT
      '${strategyId}' AS strategy_id,
      r.target_gw,
      count(selected.player_id) AS picked_players,
      coalesce(sum(selected.actual_points), 0) AS round_points
    FROM rounds r
    LEFT JOIN selected ON selected.target_gw = r.target_gw AND selected.pick_rank <= 15
    GROUP BY ALL
    ORDER BY target_gw
  `;
}

export async function calculateFormulaBacktests(
  strategies: FormulaStrategy[],
): Promise<StrategyBacktest[]> {
  const dataset = await loadMosaicDataset();
  const coordinator = dataset.coordinator();

  const reports: StrategyBacktest[] = [];
  for (const strategy of strategies) {
    const rows = await coordinator.query(backtestQuery(strategy), {
      type: "json",
      cache: false,
    }) as BacktestRow[];
    const rounds = rows.map((row) => ({
      gameweek: Number(row.target_gw),
      pickedPlayers: Number(row.picked_players),
      points: Number(row.round_points),
    }));
    const totalPoints = rounds.reduce((total, round) => total + round.points, 0);
    reports.push({
      strategyId: strategy.id,
      totalPoints,
      averagePoints: rounds.length ? totalPoints / rounds.length : 0,
      completeSelections: rounds.filter((round) => round.pickedPlayers === 15).length,
      rounds,
    });
  }

  return reports;
}
