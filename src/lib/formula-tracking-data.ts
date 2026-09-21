import { query } from "@/lib/db";
import {
  sanitiseParams,
  TRACKER_PRESET_STRATEGIES,
  type FormulaStrategy,
} from "@/lib/scoring";
import type { BacktestRound, StrategyBacktest } from "@/lib/formula-tracking-cache";

export type { BacktestRound, StrategyBacktest } from "@/lib/formula-tracking-cache";
export type { FormulaStrategy } from "@/lib/scoring";
export { TRACKER_PRESET_STRATEGIES };

/** @deprecated Use TRACKER_PRESET_STRATEGIES instead. */
export const STARTER_STRATEGIES = TRACKER_PRESET_STRATEGIES;

type BacktestRow = {
  strategy_id: string;
  target_gw: number;
  picked_players: number;
  round_points: number;
};

function escapedSqlString(value: string) {
  return value.replaceAll("'", "''");
}

function buildStrategyValuesClause(strategies: FormulaStrategy[]) {
  return strategies
    .map((strategy) => {
      const params = sanitiseParams(strategy.params);
      const totalWeight =
        params.weights.individual + params.weights.team + params.weights.fixtures || 1;
      return `(
        '${escapedSqlString(strategy.id)}',
        ${params.formWindow},
        ${params.fixtureHorizon},
        ${params.minMinutes},
        ${params.weights.individual},
        ${params.weights.team},
        ${params.weights.fixtures},
        ${totalWeight}
      )`;
    })
    .join(",\n      ");
}

export function buildMultiFormulaBacktestQuery(strategies: FormulaStrategy[]) {
  if (strategies.length === 0) {
    throw new Error("At least one formula is required for a backtest.");
  }

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
        concat(cast(cast(substring(sync.season, 1, 4) AS INTEGER) - 1 AS VARCHAR), '-', substring(sync.season, 3, 2)) AS prior_season,
        coalesce(max(f.event), 0) AS completed_gameweek
      FROM current_sync sync
      LEFT JOIN fixtures f ON f.season = sync.season AND f.finished = true
      GROUP BY sync.season
    ),
    rounds AS (
      SELECT target_gw
      FROM context, generate_series(1, context.completed_gameweek) AS gameweeks(target_gw)
    ),
    strategies AS (
      SELECT *
      FROM (VALUES
      ${buildStrategyValuesClause(strategies)}
      ) AS configured(
        strategy_id,
        form_window,
        fixture_horizon,
        min_minutes,
        w_individual,
        w_team,
        w_fixtures,
        total_weight
      )
    ),
    player_features AS (
      SELECT
        s.strategy_id,
        r.target_gw,
        p.player_id,
        p.position,
        max(p.team_id) AS team_id,
        coalesce(sum(history.minutes), 0) AS minutes,
        coalesce(sum(history.total_points), 0) AS form_points,
        coalesce(sum(history.expected_goals), 0) AS xg,
        coalesce(sum(history.expected_assists), 0) AS xa,
        coalesce(sum(history.defensive_contribution), 0) AS defcon,
        coalesce(max(CASE WHEN summary.minutes >= 450 THEN summary.total_points / summary.minutes * 90 END), 0) AS last_year_per_90,
        coalesce(max(CASE WHEN summary.minutes >= 450 THEN (summary.expected_goals + summary.expected_assists) / summary.minutes * 90 END), 0) AS last_year_xgi_per_90
      FROM players p
      CROSS JOIN context c
      CROSS JOIN rounds r
      CROSS JOIN strategies s
      LEFT JOIN player_season_summaries summary
        ON summary.season = c.prior_season AND summary.player_code = p.player_code
      LEFT JOIN player_fixture_stats history
        ON history.season = c.season
        AND history.player_id = p.player_id
        AND history.event BETWEEN greatest(1, r.target_gw - s.form_window) AND r.target_gw - 1
      WHERE p.season = c.season
      GROUP BY s.strategy_id, r.target_gw, p.player_id, p.position
    ),
    match_form AS (
      SELECT s.strategy_id, r.target_gw, f.team_h AS team_id,
             CASE WHEN f.team_h_score > f.team_a_score THEN 3 WHEN f.team_h_score = f.team_a_score THEN 1 ELSE 0 END AS points,
             f.team_h_score AS scored, f.team_a_score AS conceded
      FROM context c CROSS JOIN rounds r CROSS JOIN strategies s
      JOIN fixtures f ON f.season = c.season
        AND f.finished = true
        AND f.event BETWEEN greatest(1, r.target_gw - s.form_window) AND r.target_gw - 1
      UNION ALL
      SELECT s.strategy_id, r.target_gw, f.team_a AS team_id,
             CASE WHEN f.team_a_score > f.team_h_score THEN 3 WHEN f.team_a_score = f.team_h_score THEN 1 ELSE 0 END AS points,
             f.team_a_score AS scored, f.team_h_score AS conceded
      FROM context c CROSS JOIN rounds r CROSS JOIN strategies s
      JOIN fixtures f ON f.season = c.season
        AND f.finished = true
        AND f.event BETWEEN greatest(1, r.target_gw - s.form_window) AND r.target_gw - 1
    ),
    player_team_form AS (
      SELECT
        s.strategy_id,
        r.target_gw,
        CASE WHEN history.was_home THEN fixture.team_h ELSE fixture.team_a END AS team_id,
        coalesce(sum(history.expected_goals + history.expected_assists), 0) AS xgi,
        coalesce(sum(history.defensive_contribution), 0) AS defcon
      FROM context c CROSS JOIN rounds r CROSS JOIN strategies s
      JOIN player_fixture_stats history
        ON history.season = c.season
        AND history.event BETWEEN greatest(1, r.target_gw - s.form_window) AND r.target_gw - 1
      JOIN fixtures fixture ON fixture.season = history.season AND fixture.fixture_id = history.fixture_id
      GROUP BY s.strategy_id, r.target_gw, CASE WHEN history.was_home THEN fixture.team_h ELSE fixture.team_a END
    ),
    team_form AS (
      SELECT
        m.strategy_id,
        m.target_gw,
        m.team_id,
        avg(m.points) + avg(m.scored) * 0.35 + coalesce(max(p.xgi), 0) * 0.1 AS attack,
        (3 - avg(m.conceded)) + coalesce(max(p.defcon), 0) * 0.03 AS defence
      FROM match_form m
      LEFT JOIN player_team_form p
        ON p.strategy_id = m.strategy_id AND p.target_gw = m.target_gw AND p.team_id = m.team_id
      GROUP BY m.strategy_id, m.target_gw, m.team_id
    ),
    upcoming AS (
      SELECT s.strategy_id, r.target_gw, f.team_h AS team_id, f.team_h_difficulty AS difficulty, true AS was_home
      FROM context c CROSS JOIN rounds r CROSS JOIN strategies s
      JOIN fixtures f ON f.season = c.season
        AND f.event >= r.target_gw
        AND f.event < r.target_gw + s.fixture_horizon
      UNION ALL
      SELECT s.strategy_id, r.target_gw, f.team_a AS team_id, f.team_a_difficulty AS difficulty, false AS was_home
      FROM context c CROSS JOIN rounds r CROSS JOIN strategies s
      JOIN fixtures f ON f.season = c.season
        AND f.event >= r.target_gw
        AND f.event < r.target_gw + s.fixture_horizon
    ),
    fixture_metrics AS (
      SELECT
        strategy_id,
        target_gw,
        team_id,
        avg((6 - difficulty + CASE WHEN was_home THEN 0.5 ELSE -0.5 END) * 20) AS fixture_raw
      FROM upcoming
      GROUP BY strategy_id, target_gw, team_id
    ),
    round_outcomes AS (
      SELECT
        r.target_gw,
        outcome.player_id,
        coalesce(sum(outcome.total_points), 0) AS actual_points
      FROM context c CROSS JOIN rounds r
      JOIN player_fixture_stats outcome
        ON outcome.season = c.season AND outcome.event = r.target_gw
      GROUP BY r.target_gw, outcome.player_id
    ),
    raw_scores AS (
      SELECT
        pf.*,
        s.min_minutes,
        s.w_individual,
        s.w_team,
        s.w_fixtures,
        s.total_weight,
        coalesce(outcome.actual_points, 0) AS actual_points,
        (pf.xg + pf.xa) * 0.55
          + pf.form_points * 0.3
          + pf.defcon * CASE WHEN pf.position = 'DEF' THEN 1 WHEN pf.position = 'MID' THEN 0.55 ELSE 0.15 END * 0.15
          + (pf.last_year_xgi_per_90 * 4 + pf.last_year_per_90) * 0.25 AS individual_raw,
        coalesce(tf.attack, 0) * CASE WHEN pf.position IN ('GKP', 'DEF') THEN 0.4 ELSE 0.8 END
          + coalesce(tf.defence, 0) * CASE WHEN pf.position IN ('GKP', 'DEF') THEN 0.6 ELSE 0.2 END AS team_raw,
        coalesce(fm.fixture_raw, 0) AS fixture_raw
      FROM player_features pf
      JOIN strategies s ON s.strategy_id = pf.strategy_id
      LEFT JOIN team_form tf
        ON tf.strategy_id = pf.strategy_id AND tf.target_gw = pf.target_gw AND tf.team_id = pf.team_id
      LEFT JOIN fixture_metrics fm
        ON fm.strategy_id = pf.strategy_id AND fm.target_gw = pf.target_gw AND fm.team_id = pf.team_id
      LEFT JOIN round_outcomes outcome ON outcome.target_gw = pf.target_gw AND outcome.player_id = pf.player_id
    ),
    scaled_scores AS (
      SELECT
        *,
        CASE WHEN max(individual_raw) OVER (PARTITION BY strategy_id, target_gw) = min(individual_raw) OVER (PARTITION BY strategy_id, target_gw) THEN 50 ELSE (individual_raw - min(individual_raw) OVER (PARTITION BY strategy_id, target_gw)) * 100 / (max(individual_raw) OVER (PARTITION BY strategy_id, target_gw) - min(individual_raw) OVER (PARTITION BY strategy_id, target_gw)) END AS individual_score,
        CASE WHEN max(team_raw) OVER (PARTITION BY strategy_id, target_gw) = min(team_raw) OVER (PARTITION BY strategy_id, target_gw) THEN 50 ELSE (team_raw - min(team_raw) OVER (PARTITION BY strategy_id, target_gw)) * 100 / (max(team_raw) OVER (PARTITION BY strategy_id, target_gw) - min(team_raw) OVER (PARTITION BY strategy_id, target_gw)) END AS team_score,
        CASE WHEN max(fixture_raw) OVER (PARTITION BY strategy_id, target_gw) = min(fixture_raw) OVER (PARTITION BY strategy_id, target_gw) THEN 50 ELSE (fixture_raw - min(fixture_raw) OVER (PARTITION BY strategy_id, target_gw)) * 100 / (max(fixture_raw) OVER (PARTITION BY strategy_id, target_gw) - min(fixture_raw) OVER (PARTITION BY strategy_id, target_gw)) END AS fixture_score
      FROM raw_scores
    ),
    selected AS (
      SELECT
        *,
        row_number() OVER (
          PARTITION BY strategy_id, target_gw
          ORDER BY
            (individual_score * w_individual + team_score * w_team + fixture_score * w_fixtures) / total_weight DESC,
            xg + xa DESC
        ) AS pick_rank
      FROM scaled_scores
      WHERE minutes >= min_minutes
    )
    SELECT
      s.strategy_id,
      r.target_gw,
      count(selected.player_id) AS picked_players,
      coalesce(sum(selected.actual_points), 0) AS round_points
    FROM strategies s
    CROSS JOIN rounds r
    LEFT JOIN selected
      ON selected.strategy_id = s.strategy_id
      AND selected.target_gw = r.target_gw
      AND selected.pick_rank <= 15
    GROUP BY s.strategy_id, r.target_gw
    ORDER BY strategy_id, target_gw
  `;
}

export function buildFormulaBacktestQuery(strategy: FormulaStrategy) {
  return buildMultiFormulaBacktestQuery([strategy]);
}

function summariseBacktestRows(rows: BacktestRow[]): StrategyBacktest[] {
  const roundsByStrategy = new Map<string, BacktestRound[]>();
  for (const row of rows) {
    const rounds = roundsByStrategy.get(row.strategy_id) ?? [];
    rounds.push({
      gameweek: Number(row.target_gw),
      pickedPlayers: Number(row.picked_players),
      points: Number(row.round_points),
    });
    roundsByStrategy.set(row.strategy_id, rounds);
  }

  return [...roundsByStrategy.entries()].map(([strategyId, rounds]) => {
    const totalPoints = rounds.reduce((total, round) => total + round.points, 0);
    return {
      strategyId,
      totalPoints,
      averagePoints: rounds.length ? totalPoints / rounds.length : 0,
      completeSelections: rounds.filter((round) => round.pickedPlayers === 15).length,
      rounds,
    };
  });
}

export async function getDatasetSyncKey() {
  const rows = await query<{ synced_at: string | null }>(
    `SELECT cast(max(completed_at) AS VARCHAR) AS synced_at
     FROM sync_runs
     WHERE status = 'complete' AND source = 'official-fpl-api'`,
  );
  return rows[0]?.synced_at ?? "unknown";
}

export async function calculateFormulaBacktests(strategies: FormulaStrategy[]): Promise<StrategyBacktest[]> {
  const rows = await query<BacktestRow>(buildMultiFormulaBacktestQuery(strategies));
  return summariseBacktestRows(rows);
}
