import { beforeEach, describe, expect, it } from "vitest";
import { query, resetTestDatabase, run } from "../src/lib/db";

beforeEach(async () => {
  await resetTestDatabase();
});

describe("PostgreSQL data layer", () => {
  it("persists and reloads hydrated rows", async () => {
    await run(
      `INSERT INTO player_season_summaries (
        season, player_code, web_name, position, total_points, minutes,
        expected_goals, expected_assists, defensive_contribution
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
