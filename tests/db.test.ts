import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

const testParquetDirectory = path.join(tmpdir(), `fpl-formula-${randomUUID()}`);
process.env.FPL_PARQUET_DIR = testParquetDirectory;

let createHydrationConnection: typeof import("../src/lib/db").createHydrationConnection;
let exportParquetDataset: typeof import("../src/lib/db").exportParquetDataset;
let query: typeof import("../src/lib/db").query;
let resetReadConnection: typeof import("../src/lib/db").resetReadConnection;

beforeAll(async () => {
  ({ createHydrationConnection, exportParquetDataset, query, resetReadConnection } = await import("../src/lib/db"));
});

describe("DuckDB data layer", () => {
  it("exports hydration tables to Parquet and reloads them in memory", async () => {
    const connection = await createHydrationConnection();
    await connection.run(
      `INSERT OR REPLACE INTO player_season_summaries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["2025-26", 42, "Test Player", "MID", 150, 2700, 8.5, 7.2, 200],
    );
    await exportParquetDataset(connection);
    connection.closeSync();
    resetReadConnection();

    const rows = await query<{ web_name: string; total_points: number; expected_goals: number }>(
      `SELECT web_name, total_points, expected_goals
       FROM player_season_summaries WHERE season = ? AND player_code = ?`,
      ["2025-26", 42],
    );

    expect(rows).toEqual([{ web_name: "Test Player", total_points: 150, expected_goals: 8.5 }]);
  });
});
