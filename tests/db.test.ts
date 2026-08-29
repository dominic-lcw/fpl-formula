import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

const testDatabase = path.join(tmpdir(), `fpl-formula-${randomUUID()}.duckdb`);
process.env.FPL_DB_PATH = testDatabase;

let execute: typeof import("../src/lib/db").execute;
let query: typeof import("../src/lib/db").query;

beforeAll(async () => {
  ({ execute, query } = await import("../src/lib/db"));
});

describe("DuckDB data layer", () => {
  it("initializes the schema and persists prior-season player summaries", async () => {
    await execute(
      `INSERT OR REPLACE INTO player_season_summaries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["2025-26", 42, "Test Player", "MID", 150, 2700, 8.5, 7.2, 200],
    );
    const rows = await query<{ web_name: string; total_points: number; expected_goals: number }>(
      `SELECT web_name, total_points, expected_goals
       FROM player_season_summaries WHERE season = ? AND player_code = ?`,
      ["2025-26", 42],
    );

    expect(rows).toEqual([{ web_name: "Test Player", total_points: 150, expected_goals: 8.5 }]);
  });
});
