import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";
import {
  FORMULA,
  bonusPointsSumSql,
  fixtureBonusSubquerySql,
  individualRawSql,
  matchBonusClaim,
} from "../src/lib/formula";
import { buildMultiFormulaBacktestQuery, TRACKER_PRESET_STRATEGIES } from "../src/lib/formula-tracking-data";

const testParquetDirectory = path.join(tmpdir(), `fpl-formula-balance-${randomUUID()}`);
process.env.FPL_PARQUET_DIR = testParquetDirectory;

let createHydrationConnection: typeof import("../src/lib/db").createHydrationConnection;

beforeAll(async () => {
  ({ createHydrationConnection } = await import("../src/lib/db"));
});

describe("match bonus claim", () => {
  it("lets a clear attacking performance outrank a high defensive count", () => {
    const forward = matchBonusClaim({ xg: 0.8, xa: 0.15, threat: 70, creativity: 22, defcon: 3 });
    const defender = matchBonusClaim({ xg: 0.04, xa: 0.02, threat: 8, creativity: 12, defcon: 22 });
    expect(forward).toBeGreaterThan(defender);
  });

  it("lets a dominant defender win a quiet match", () => {
    const defender = matchBonusClaim({ xg: 0.05, xa: 0.02, threat: 6, creativity: 10, defcon: 20 });
    const passenger = matchBonusClaim({ xg: 0.04, xa: 0.01, threat: 12, creativity: 8, defcon: 2 });
    expect(defender).toBeGreaterThan(passenger);
  });
});

describe("fixture bonus award", () => {
  it("gives 3 points to the higher match claim in each fixture", async () => {
    const connection = await createHydrationConnection();
    await connection.run(`
      INSERT INTO player_fixture_stats
        (season, player_id, fixture_id, event, minutes, expected_goals, expected_assists, threat, creativity, defensive_contribution)
      VALUES
        ('2025-26', 1, 10, 1, 90, 0.04, 0.02, 8, 12, 22),
        ('2025-26', 2, 10, 1, 90, 0.8, 0.15, 70, 22, 3),
        ('2025-26', 1, 11, 2, 90, 0.05, 0.02, 6, 10, 20),
        ('2025-26', 2, 11, 2, 85, 0.04, 0.01, 12, 8, 2),
        ('2025-26', 3, 11, 2, 0, 1.4, 0.4, 90, 40, 0);
    `);

    const reader = await connection.runAndReadAll(`
      SELECT player_id, fixture_id, bonus_points
      FROM (${fixtureBonusSubquerySql()}) bonus
      ORDER BY fixture_id, player_id
    `);
    const rows = reader.getRowObjectsJS().map((row) => ({
      player_id: Number(row.player_id),
      fixture_id: Number(row.fixture_id),
      bonus_points: Number(row.bonus_points),
    }));
    connection.closeSync();

    expect(rows).toEqual([
      { player_id: 2, fixture_id: 10, bonus_points: FORMULA.bonusAward },
      { player_id: 1, fixture_id: 11, bonus_points: FORMULA.bonusAward },
    ]);
  });
});

describe("shared individual expression", () => {
  it("uses the same attack, defence, and bonus weights in SQL backtests", () => {
    const expression = individualRawSql("pf");
    const backtest = buildMultiFormulaBacktestQuery([TRACKER_PRESET_STRATEGIES[0]!]);
    expect(expression).toContain(`attack_con * ${FORMULA.attackCon}`);
    expect(expression).toContain(`defcon * ${FORMULA.defcon}`);
    expect(expression).toContain(`bonus_points * ${FORMULA.bonus}`);
    expect(bonusPointsSumSql("bonus")).toContain("count(distinct");
    expect(expression).not.toContain("CASE WHEN");
    expect(backtest).toContain(expression);
    expect(backtest).toContain(`* ${FORMULA.teamDefcon}`);
    expect(backtest).toContain(`* ${FORMULA.teamAttackCon}`);
  });
});
