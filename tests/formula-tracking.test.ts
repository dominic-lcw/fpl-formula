import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
import { STARTER_STRATEGIES, buildFormulaBacktestQuery } from "../src/lib/formula-tracking-data";

const testParquetDirectory = path.join(tmpdir(), `fpl-formula-tracker-${randomUUID()}`);
process.env.FPL_PARQUET_DIR = testParquetDirectory;

let createHydrationConnection: typeof import("../src/lib/db").createHydrationConnection;

beforeAll(async () => {
  ({ createHydrationConnection } = await import("../src/lib/db"));
});

describe("formula backtest query", () => {
  it("aggregates historic team ids without mixing non-aggregated columns", async () => {
    const connection = await createHydrationConnection();
    await connection.run(`
      INSERT INTO teams (season, team_id, name, short_name) VALUES
        ('2025-26', 10, 'Arsenal', 'ARS'),
        ('2025-26', 20, 'Chelsea', 'CHE');
      INSERT INTO players (season, player_id, web_name, player_code, team_id, position) VALUES
        ('2025-26', 1, 'Alpha', 101, 10, 'MID'),
        ('2025-26', 2, 'Bravo', 102, 20, 'FWD');
      INSERT INTO player_season_summaries
        (season, player_code, web_name, position, total_points, minutes, expected_goals, expected_assists, defensive_contribution)
      VALUES
        ('2024-25', 101, 'Alpha', 'MID', 150, 2700, 8.5, 7.2, 80),
        ('2024-25', 102, 'Bravo', 'FWD', 120, 2400, 12, 4, 10);
      INSERT INTO fixtures
        (season, fixture_id, event, team_h, team_a, team_h_score, team_a_score, team_h_difficulty, team_a_difficulty, finished)
      VALUES
        ('2025-26', 1, 1, 10, 20, 2, 1, 2, 4, true),
        ('2025-26', 2, 2, 20, 10, 0, 1, 3, 3, true);
      INSERT INTO player_fixture_stats
        (season, player_id, fixture_id, event, was_home, total_points, minutes, expected_goals, expected_assists, defensive_contribution)
      VALUES
        ('2025-26', 1, 1, 1, true, 8, 90, 0.5, 0.2, 4),
        ('2025-26', 2, 1, 1, false, 2, 80, 0.1, 0.0, 1),
        ('2025-26', 1, 2, 2, false, 6, 90, 0.3, 0.1, 3),
        ('2025-26', 2, 2, 2, true, 4, 70, 0.4, 0.1, 0);
      INSERT INTO sync_runs (season, source, status, records_loaded, completed_at)
      VALUES ('2025-26', 'official-fpl-api', 'complete', 4, '2025-09-01');
    `);

    const reader = await connection.runAndReadAll(buildFormulaBacktestQuery(STARTER_STRATEGIES[0]));
    const rows = reader.getRowObjectsJS() as Array<{
      strategy_id: string;
      target_gw: number | bigint;
      picked_players: number | bigint;
      round_points: number;
    }>;
    connection.closeSync();

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => Number(row.target_gw))).toEqual([1, 2]);
    expect(rows.every((row) => row.strategy_id === "balanced")).toBe(true);
    expect(rows.every((row) => Number(row.picked_players) === 2)).toBe(true);
    expect(rows.map((row) => Number(row.round_points))).toEqual([10, 10]);
  });
});
